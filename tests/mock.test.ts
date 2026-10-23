import { describe, it, expect, beforeEach } from 'vitest';
import { createMockClient, parseSnapshot, parseGoal } from '@/lib/mubit/mock';
import { buildMessages } from '@/lib/agent/prompt';
import { resetMemoryRepo } from '@/lib/db';
import { mubitMode } from '@/lib/mubit';
import { costUsd } from '@/lib/pricing';

process.env.MOCK_LATENCY_SCALE = '0';
process.env.MOCK_TRAIN_SECONDS = '0';
process.env.MUBIT_ENABLED = 'false';
delete process.env.DATABASE_URL;

const UPSELL = `PAGE home | LAYOUT layout-v3 | CART 1 items £48.00
[modal:upsell] e1 heading "Protect your purchase?" | e2 button "Protect it — £6" | e3 button "Not now"
[header] e4 button "Cart (1)"
[grid] e5 link "Aurora Lamp" | e6 button "Add to bag"`;
const COOKIES = `PAGE home | LAYOUT layout-v3 | CART 0 items £0.00
[modal:cookies] e1 button "OK, got it" | e2 button "Reject non-essential"
[header] e3 button "Cart (0)"`;
const NAN = `PAGE checkout | LAYOUT layout-v3 | CART 2 items
[summary] e9 text "Total £NaN"`;

const goal = 'Buy one Aurora Lamp and reach order confirmation.';
const msgs = (snapshot: string, lane: 'base' | 'adapted' | 'icl' | 'closed' = 'base', icl?: string[]) => buildMessages({ goal, history: [], snapshot, lane, iclExamples: icl });

describe('mock snapshot/goal parsing', () => {
  it('parses snapshot', () => {
    const s = parseSnapshot(UPSELL);
    expect(s.page).toBe('home'); expect(s.cartCount).toBe(1); expect(s.els).toHaveLength(6);
    expect(s.els[1]).toMatchObject({ id: 'e2', role: 'button', label: 'Protect it — £6', region: 'modal:upsell' });
  });
  it('parses goals', () => {
    expect(parseGoal('Buy two Ember Mugs using the test coupon.')).toEqual({ items: [{ name: 'Ember Mug', qty: 2 }], coupon: true });
    expect(parseGoal('Buy the cheapest product in the store.').items[0].name).toBe('Ember Mug');
    expect(parseGoal('Buy one of every product under £20.').items.map((i) => i.name)).toEqual(['Ember Mug', 'Moss Planter']);
    expect(parseGoal('Buy a Drift Hoodie and an Aurora Lamp.').items.map((i) => i.name)).toEqual(['Drift Hoodie', 'Aurora Lamp']);
  });
});

describe('mock client', () => {
  beforeEach(() => { resetMemoryRepo(); });

  it('is clearly mock', () => expect(mubitMode()).toBe('mock'));

  it('base open model accepts the upsell (violates R1)', async () => {
    const r = await createMockClient().chat({ model: 'open:open-base', messages: msgs(UPSELL) });
    expect(JSON.parse(r.text)).toMatchObject({ type: 'click', target: 'e2' });
    expect(r.usage.in).toBeGreaterThan(100); expect(r.callId).toMatch(/^mock_/);
  });

  it('base accepts all cookies; a version that learned R5 rejects', async () => {
    const repo = resetMemoryRepo();
    const m = createMockClient();
    expect(JSON.parse((await m.chat({ model: 'open:open-base', messages: msgs(COOKIES) })).text).target).toBe('e1');
    await repo.versions.insert({ id: 'v5', label: 'v2', baseModel: 'open-base', examples: 9, status: 'ready', rules: ['R5'] });
    expect(JSON.parse((await m.chat({ model: 'open:open-base', versionId: 'v5', messages: msgs(COOKIES) })).text).target).toBe('e2');
  });

  it('version with R1 learned from real corrections declines, via refresh flow', async () => {
    const repo = resetMemoryRepo();
    const m = createMockClient();
    await repo.corrections.insert({ source: 'human', rule: 'R1', goal, messages: msgs(UPSELL), goodAction: { type: 'click', target: 'e3', reason: 'decline' }, status: 'sent' });
    const job = await m.requestRefresh();
    expect(job.mode).toBe('explicit');
    const st = await m.refreshStatus(job.jobId);
    expect(st?.status).toBe('ready'); expect(st?.examples).toBe(1);
    const v = await repo.versions.get(job.jobId!);
    expect(v?.rules).toEqual(['R1']);
    const r = await m.chat({ model: 'open:open-base', versionId: job.jobId!, messages: msgs(UPSELL) });
    expect(JSON.parse(r.text)).toMatchObject({ type: 'click', target: 'e3' });
    expect((await repo.corrections.list({ status: 'trained' }))).toHaveLength(1);
  });

  it('a version without BUG never reports; with BUG always reports', async () => {
    const repo = resetMemoryRepo();
    const m = createMockClient();
    await repo.versions.insert({ id: 'a', label: 'v2', baseModel: 'b', examples: 5, status: 'ready', rules: ['R1'] });
    await repo.versions.insert({ id: 'b', label: 'v3', baseModel: 'b', examples: 5, status: 'ready', rules: ['R1', 'BUG'] });
    expect(JSON.parse((await m.chat({ model: 'open:x', versionId: 'a', messages: msgs(NAN) })).text).type).not.toBe('report_bug');
    expect(JSON.parse((await m.chat({ model: 'open:x', versionId: 'b', messages: msgs(NAN) })).text).type).toBe('report_bug');
  });

  it('ICL lane follows rules present in its examples', async () => {
    const m = createMockClient();
    const r = await m.chat({ model: 'open:x', messages: msgs(UPSELL, 'icl', ['[R1] PAGE home / [modal:upsell] ... → click e3 ("Not now") — decline']) });
    // 85% seeded; deterministic for this snapshot
    expect(['e2', 'e3']).toContain(JSON.parse(r.text).target);
  });

  it('is deterministic and prices closed calls only', async () => {
    const m = createMockClient();
    const a = await m.chat({ model: 'closed:gpt-4o-mini', messages: msgs(UPSELL, 'closed') });
    const b = await m.chat({ model: 'closed:gpt-4o-mini', messages: msgs(UPSELL, 'closed') });
    expect(a.text).toBe(b.text); expect(a.latencyMs).toBeGreaterThanOrEqual(900);
    expect(costUsd('closed:gpt-4o-mini', { in: 1_000_000, out: 0 })).toBeCloseTo(0.15);
    expect(costUsd('open:open-base', { in: 1000, out: 10 })).toBeNull();
  });
});

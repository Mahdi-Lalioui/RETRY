import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAction } from '@/lib/agent/parse';
import { resolveModelRef } from '@/lib/agent/policy';
import { FinishS, ShopStateS, StepRequestS } from '@/app/api/_lib/schemas';
import { POST as finish } from '@/app/api/agent/finish/route';
import { initialState } from '@/lib/shop/engine';
import { resetMemoryRepo, repo } from '@/lib/db';
import { startEval } from '@/lib/eval/runner';

afterEach(() => vi.unstubAllEnvs());

describe('external input boundaries', () => {
  it.each(['type', 'select'])('rejects %s without a value instead of silently clearing the input', (type) => {
    expect(parseAction(JSON.stringify({ type, target: 'e1' }), ['e1']).action).toBeNull();
  });

  it('permits an explicit empty textbox value', () => {
    expect(parseAction('{"type":"type","target":"e1","value":""}', ['e1']).action)
      .toMatchObject({ type: 'type', value: '' });
  });

  it.each([
    {},
    { layout: {} },
    { ...initialState(1, 1), cart: [{ sku: 'unknown', qty: 1, protection: false, giftwrap: false }] },
    { ...initialState(1, 1), shipping: 'invalid' },
    { ...initialState(1, 1), cart: [{ sku: 'ember-mug', qty: -1, protection: false, giftwrap: false }] },
  ])('rejects malformed shop state before the engine receives it', (state) => {
    expect(ShopStateS.safeParse(state).success).toBe(false);
  });

  it('preserves engine UI evidence and handles JSON-serialized NaN totals', () => {
    const state = { ...initialState(1, 1, ['total_nan'], { collectRequired: true }), totalPence: NaN };
    const result = ShopStateS.parse(JSON.parse(JSON.stringify(state)));
    expect(result.ui).toMatchObject({ collectRequired: true, payAttempts: 0 });
    expect(result.totalPence).toBeUndefined();
  });

  it('rejects unknown task IDs', () => {
    expect(FinishS.safeParse({ runId: 'r', lane: 'base', taskId: 'T999', finalAction: null }).success).toBe(false);
  });

  it('rejects malformed optional step state', () => {
    expect(StepRequestS.safeParse({ runId: 'r', lane: 'base', taskId: 'T1', goal: 'buy', snapshot: 'PAGE home',
      history: [], stepIdx: 0, modelRef: { kind: 'open', model: 'open:base' }, state: {} }).success).toBe(false);
  });

  it('returns 400 for malformed JSON finalStateDigest instead of crashing inside the oracle', async () => {
    const response = await finish(new Request('http://test/api/agent/finish', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'r', lane: 'base', taskId: 'T1', finalAction: { type: 'done' }, finalStateDigest: '{"layout":{}}' }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).ok).toBe(false);
  });

  it('uses server model configuration when client model refs contain bundled defaults or arbitrary IDs', async () => {
    vi.stubEnv('OPEN_BASE_MODEL', 'configured-open');
    vi.stubEnv('CLOSED_MODEL', 'configured-closed');
    expect((await resolveModelRef('base', { kind: 'closed', model: 'expensive-client-model', label: 'base' })).ref)
      .toMatchObject({ kind: 'open', model: 'open:configured-open' });
    expect((await resolveModelRef('closed', { kind: 'open', model: 'open-base', label: 'closed' })).ref)
      .toMatchObject({ kind: 'closed', model: 'closed:configured-closed' });
  });

  it('preserves a remote adapter identity even when its example count is zero', async () => {
    resetMemoryRepo();
    await repo.versions.insert({ id: 'remote', label: 'v2', baseModel: 'base', status: 'ready', examples: 0, mubitVersionId: 'adapter-2' });
    expect((await resolveModelRef('adapted', { kind: 'open', model: 'open-base', label: 'v2', versionId: 'remote' })).ref.versionId)
      .toBe('adapter-2');
  });

  it('never evaluates a non-baseline adapter as the base lane merely because it has zero examples', async () => {
    resetMemoryRepo();
    await repo.versions.insert({ id: 'remote', label: 'v2', baseModel: 'base', status: 'ready', examples: 0, mubitVersionId: 'adapter-2' });
    await expect(startEval({ lane: 'base', versionId: 'remote', suite: 'heldout' })).rejects.toThrow(/base/i);
  });
});

// Route handlers called directly. finish/eval parts NEED AGENT A's real lib/shop (oracle/tasks/engine); stubs locally.
import { describe, it, expect, beforeAll } from 'vitest';
import { resetMemoryRepo } from '@/lib/db';
import { POST as step } from '@/app/api/agent/step/route';
import { POST as finish } from '@/app/api/agent/finish/route';
import { POST as correct, GET as listCorrections } from '@/app/api/corrections/route';
import { POST as refresh } from '@/app/api/refresh/route';
import { GET as refreshStatus } from '@/app/api/refresh/status/route';
import { GET as versions } from '@/app/api/versions/route';
import { POST as activate } from '@/app/api/versions/activate/route';
import { GET as metrics } from '@/app/api/metrics/route';
import { GET as health } from '@/app/api/health/route';
import { POST as evalRun } from '@/app/api/eval/run/route';
import { GET as evalStatus } from '@/app/api/eval/status/route';
import { initialState } from '@/lib/shop/engine';

process.env.MOCK_LATENCY_SCALE = '0';
process.env.MOCK_TRAIN_SECONDS = '0';
process.env.MUBIT_ENABLED = 'false';
delete process.env.DATABASE_URL;

const post = (body: unknown) => new Request('http://t/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const get = (qs = '') => new Request(`http://t/api${qs}`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (r: Response): Promise<any> => r.json();

const UPSELL = `PAGE home | LAYOUT layout-v3 | CART 1 items £48.00
[modal:upsell] e1 heading "Protect your purchase?" | e2 button "Protect it — £6" | e3 button "Not now"
[header] e4 button "Cart (1)"`;
const goal = 'Buy one Aurora Lamp and reach order confirmation.';
const stepBody = (lane: 'base' | 'adapted', runId: string) => ({
  runId, lane, taskId: 'T1', goal, snapshot: UPSELL, history: [], stepIdx: 0,
  modelRef: { kind: 'open', model: 'open:open-base', label: lane },
});

describe('API routes (mock + memory)', () => {
  beforeAll(() => { resetMemoryRepo(); });

  it('health reports mock', async () => {
    const r = await json(await health());
    expect(r).toMatchObject({ ok: true, data: { mubit: 'mock', db: 'ok', demoMode: false } });
  });

  it('validates input', async () => {
    const r = await step(post({ runId: 'x' }));
    expect(r.status).toBe(400); expect((await json(r)).ok).toBe(false);
  });

  it('[G] step with a malformed state does not 500', async () => {
    const r = await step(post({ ...stepBody('base', 'run_junk'), state: { junk: true } }));
    expect(r.status).toBe(200);
  });

  it('rescue → refresh → promoted version declines the upsell', async () => {
    const s1 = await json(await step(post(stepBody('base', 'run_a'))));
    expect(s1.ok).toBe(true);
    expect(s1.data.action).toMatchObject({ type: 'click', target: 'e2' });
    expect(s1.data.costUsd).toBeNull();

    const c = await json(await correct(post({ stepId: s1.data.stepId, goodAction: { type: 'click', target: 'e3', reason: 'House rule: decline protection' }, rule: 'R1' })));
    expect(c.ok).toBe(true); expect(c.data.augmented).toBe(0);
    const list = await json(await listCorrections(get('?source=human')));
    expect(list.data).toHaveLength(1);
    expect(list.data[0]).toMatchObject({ rule: 'R1', badAction: { target: 'e2' }, goodAction: { target: 'e3' } });

    const st0 = await json(await refreshStatus(get()));
    expect(st0.data.phase).toBe('collecting');
    const job = await json(await refresh(post({})));
    expect(job.data.mode).toBe('explicit');
    let st = await json(await refreshStatus(get(`?jobId=${job.data.jobId}`)));
    expect(st.data.phase).toBe('evaluating'); // Agent E: the poll that ends training reports evaluating first
    for (let i = 0; i < 5 && st.data.phase === 'evaluating'; i++) st = await json(await refreshStatus(get(`?jobId=${job.data.jobId}`)));
    expect(st.data.phase).toBe('promoted');
    expect(st.data.version).toMatchObject({ label: 'v2', rules: ['R1'], promoted: true, examples: 1 });

    const s2 = await json(await step(post(stepBody('adapted', 'run_b'))));
    expect(s2.data.action).toMatchObject({ type: 'click', target: 'e3' });

    const vs = await json(await versions());
    expect(vs.data.map((v: { label: string }) => v.label)).toEqual(['v1', 'v2']);
    const act = await json(await activate(post({ versionId: 'v1' })));
    expect(act.data.version.promoted).toBe(true);
    const s3 = await json(await step(post(stepBody('adapted', 'run_c'))));
    expect(s3.data.action.target).toBe('e2'); // rolled back to base behaviour
  });

  it('finish runs the oracle on the final state', async () => {
    const state = initialState(9001, 1, ['total_nan']);
    const r = await json(await finish(post({ runId: 'run_a', lane: 'base', taskId: 'T1', finalAction: { type: 'report_bug', reason: 'NaN' }, finalState: state })));
    expect(r.data).toMatchObject({ status: 'bug_reported', correct: true });
    const m = await json(await metrics(get('?scope=live')));
    const base = m.data.rows.find((x: { lane: string }) => x.lane === 'base');
    expect(base.runs).toBe(1); expect(base.bugRecall).toBe(1);
    expect(m.data.totals.rescues).toBe(1);
  });

  it('eval smoke suite runs in chunks and lands in held-out metrics', async () => {
    const e = await json(await evalRun(post({ lane: 'base', suite: 'smoke' })));
    let s;
    for (let i = 0; i < 3; i++) { s = await json(await evalStatus(get(`?evalId=${e.data.evalId}`))); if (s.data.finished) break; }
    expect(s.data).toMatchObject({ done: 4, total: 4, finished: true });
    const m = await json(await metrics(get('?scope=heldout')));
    // Agent D: refresh now runs the 48-run held-out eval (v1 + v2) before promotion, so the board prefers those rows.
    expect(s.data.partialMetrics.runs).toBe(4);
    expect(m.data.rows.find((r: { lane: string }) => r.lane === 'base').runs).toBe(48);
  });
});

describe('[G] cold instance', () => {
  it('a step naming a version this instance never saw bootstraps, so RETRY is not served as the naive base', async () => {
    const { resetBootstrapCache } = await import('@/lib/train/bootstrap');
    const repo = resetMemoryRepo(); resetBootstrapCache();
    const r = await json(await step(post({ ...stepBody('adapted', 'run_cold'), modelRef: { kind: 'open', model: 'open:open-base', versionId: 'ver_v6_other', label: 'RETRY v6' } })));
    expect(r.ok).toBe(true);
    expect((await repo.versions.list()).length).toBeGreaterThan(1);
    expect(r.data.action).toMatchObject({ type: 'click', target: 'e3' }); // declines the upsell
  });
});

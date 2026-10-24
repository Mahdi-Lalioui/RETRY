// Agent E: the stage story at route-handler level — bootstrap → held-out scoreboard ordering → live R7 rescue →
// refresh (training → evaluating → promoted) → the adapted lane declines gift wrap.
import { describe, it, expect, beforeAll } from 'vitest';
import { resetMemoryRepo } from '@/lib/db';
import { resetBootstrapCache } from '@/lib/train/bootstrap';
import { POST as bootstrap } from '@/app/api/demo/bootstrap/route';
import { GET as metrics } from '@/app/api/metrics/route';
import { POST as step } from '@/app/api/agent/step/route';
import { POST as correct } from '@/app/api/corrections/route';
import { POST as refresh } from '@/app/api/refresh/route';
import { GET as refreshStatus } from '@/app/api/refresh/status/route';
import { GET as versions } from '@/app/api/versions/route';

process.env.MOCK_LATENCY_SCALE = '0';
process.env.MOCK_TRAIN_SECONDS = '0';
process.env.MUBIT_ENABLED = 'false';
delete process.env.DATABASE_URL;

const post = (body: unknown) => new Request('http://t/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const get = (qs = '') => new Request(`http://t/api${qs}`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (r: Response): Promise<any> => r.json();

const GIFTWRAP = `PAGE home | LAYOUT layout-v6 | CART 1 items £14.00
[modal:giftwrap] e1 heading "Make it a gift?" | e2 button "Add gift wrap (£3)" | e3 button "No gift wrap"
[header] e4 button "Cart (1)"`;
const goal = 'Buy two Ember Mugs using the test coupon.';
const body = (runId: string, versionId?: string) => ({
  runId, lane: 'adapted', taskId: 'T2', goal, snapshot: GIFTWRAP, history: [], stepIdx: 0,
  modelRef: { kind: 'open', model: 'open:open-base', label: 'RETRY', ...(versionId ? { versionId } : {}) },
});

interface Row { lane: string; versionId: string | null; runs: number; verifiedSuccess: number; bugRecall: number }

describe('stage flow (mock + memory)', () => {
  beforeAll(() => { resetMemoryRepo(); resetBootstrapCache(); });

  it('bootstrap populates a credible held-out scoreboard: v4 > GPT > base', async () => {
    const b = await json(await bootstrap());
    expect(b.ok).toBe(true);
    const m = await json(await metrics(get('?scope=heldout')));
    const rows: Row[] = m.data.rows;
    const closed = rows.find((r) => r.lane === 'closed')!;
    const base = rows.find((r) => r.lane === 'base')!;
    const vs = (await json(await versions())).data as { id: string; label: string }[];
    const v4 = vs.find((v) => v.label === 'v4')!;
    const adapted = rows.find((r) => r.lane === 'adapted' && r.versionId === v4.id)!;
    expect(closed.runs).toBe(48); expect(base.runs).toBe(48); expect(adapted.runs).toBe(48);
    expect(adapted.verifiedSuccess).toBeGreaterThan(closed.verifiedSuccess);
    expect(closed.verifiedSuccess).toBeGreaterThan(base.verifiedSuccess);
    expect(closed.verifiedSuccess).toBeGreaterThan(0.1);   // a general model is not rigged to zero…
    expect(closed.verifiedSuccess).toBeLessThan(0.5);      // …but cannot know org-specific rules
    expect(adapted.verifiedSuccess).toBeGreaterThanOrEqual(0.85);
    expect(base.verifiedSuccess).toBeLessThanOrEqual(0.1);
    expect(closed.bugRecall).toBeGreaterThan(0.5);
    expect(adapted.bugRecall).toBeGreaterThan(0.5);
    expect(base.bugRecall).toBeLessThan(0.5);
  });

  it('R7 rescue → refresh → evaluating → promoted → adapted declines gift wrap', async () => {
    const s1 = await json(await step(post(body('run_r7a'))));
    expect(s1.ok).toBe(true);
    expect(s1.data.action).toMatchObject({ type: 'click', target: 'e2' }); // v4 never saw R7

    const c = await json(await correct(post({ stepId: s1.data.stepId, goodAction: { type: 'click', target: 'e3', reason: 'House rule: decline gift wrap' }, rule: 'R7' })));
    expect(c.ok).toBe(true);

    const job = await json(await refresh(post({})));
    expect(job.ok).toBe(true);
    const phases: string[] = [];
    let st;
    for (let i = 0; i < 20; i++) {
      st = await json(await refreshStatus(get(`?jobId=${job.data.jobId}`)));
      phases.push(st.data.phase);
      if (st.data.phase === 'promoted' || st.data.phase === 'held_back') break;
    }
    expect(st.data.phase).toBe('promoted');
    expect(phases).toContain('evaluating');
    console.log('refresh phases', phases.join(' → '));
    expect(st.data.gate).toMatchObject({ pass: true }); // held-out eval ran and the gate decided
    expect(st.data.version).toMatchObject({ label: 'v5', promoted: true });
    expect(st.data.version.rules).toContain('R7');

    // Client passes the promoted versionId; also works with an id this instance never saw (falls back to promoted).
    const s2 = await json(await step(post(body('run_r7b', st.data.version.id))));
    expect(s2.data.action).toMatchObject({ type: 'click', target: 'e3' });
    const s3 = await json(await step(post(body('run_r7c', 'ver_v5_fromAnotherInstance'))));
    expect(s3.data.action).toMatchObject({ type: 'click', target: 'e3' });
  });
});

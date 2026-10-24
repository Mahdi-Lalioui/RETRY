// [G] Held-back path, end to end through the routes: corrections that overrule bug reports with "done" →
// refresh → held-out eval → gate holds the version back (bug recall regressed) → adapted stays on the previous version → rollback.
import { describe, it, expect, beforeAll } from 'vitest';
import { repo, resetMemoryRepo } from '@/lib/db';
import { resetBootstrapCache } from '@/lib/train/bootstrap';
import { POST as bootstrap } from '@/app/api/demo/bootstrap/route';
import { POST as correct } from '@/app/api/corrections/route';
import { POST as refresh } from '@/app/api/refresh/route';
import { GET as refreshStatus } from '@/app/api/refresh/status/route';
import { POST as activate } from '@/app/api/versions/activate/route';
import { simulateRun } from '@/lib/agent/sim';
import { getTask } from '@/lib/shop/tasks';
import { mockLearnedRules } from '@/lib/mubit/mock';

process.env.MOCK_LATENCY_SCALE = '0';
process.env.MOCK_TRAIN_SECONDS = '0';
process.env.MUBIT_ENABLED = 'false';
delete process.env.DATABASE_URL;

const post = (body: unknown) => new Request('http://t/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const get = (qs = '') => new Request(`http://t/api${qs}`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (r: Response): Promise<any> => r.json();

describe('held-back version', () => {
  beforeAll(() => { resetMemoryRepo(); resetBootstrapCache(); });

  it('mockLearnedRules forgets BUG only when suppressions outweigh bug reports', () => {
    const rb = { goodAction: { type: 'report_bug' as const, reason: '' }, badAction: null, rule: 'BUG' };
    const sup = { goodAction: { type: 'done' as const, reason: '' }, badAction: { type: 'report_bug' as const, reason: '' }, rule: null };
    expect(mockLearnedRules([rb, rb, sup])).toContain('BUG');
    expect(mockLearnedRules([rb, sup, sup])).not.toContain('BUG');
  });

  it('gate holds back a version that learned to pass broken checkouts', async () => {
    expect((await json(await bootstrap())).ok).toBe(true);
    const prev = await repo.versions.current();
    // A bug run where the promoted adapter correctly reports the bug; a (bad) human overrules it with "done".
    const run = await simulateRun({ task: getTask('T2'), seed: 77, versionIndex: 1, bugs: ['total_nan'], lane: 'adapted', persist: true });
    expect(run.verdict.status).toBe('bug_reported');
    const stepId = run.steps.at(-1)!.stepId;
    const reports = (await repo.corrections.list()).filter((c) => c.source !== 'augmented' && c.goodAction?.type === 'report_bug').length;
    for (let i = 0; i <= reports; i++) {
      const c = await json(await correct(post({ stepId, goodAction: { type: 'done', reason: 'looks fine' }, rule: 'Other', note: 'ship it' })));
      expect(c.ok).toBe(true);
    }
    const job = await json(await refresh(post({})));
    let st;
    for (let i = 0; i < 20; i++) {
      st = await json(await refreshStatus(get(`?jobId=${job.data.jobId}`)));
      if (st.data.phase === 'promoted' || st.data.phase === 'held_back') break;
    }
    expect(st.data.phase).toBe('held_back');
    expect(st.data.version.heldBackReason).toMatch(/HELD BACK/);
    expect((await repo.versions.current())?.id).toBe(prev?.id);
    // Rollback/activate path still works.
    const a = await json(await activate(post({ versionId: prev!.id })));
    expect(a.ok).toBe(true);
    expect((await repo.versions.current())?.id).toBe(prev?.id);
  }, 60000);
});

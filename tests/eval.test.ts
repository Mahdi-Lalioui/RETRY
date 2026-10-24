import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { assertDisjointPools, heldoutSuite, seedPool, smokeSuite, TRAINING_SEEDS, HELDOUT_SEEDS, JUDGE_SEED_MIN } from '@/lib/eval/suite';
import { runEval, startEval, evalConfig, finalMetrics } from '@/lib/eval/runner';
import { resetMemoryRepo } from '@/lib/db';
import { getTask } from '@/lib/shop/tasks';
import { bugsAffecting } from '@/lib/shop/bugs';
import { refreshStatus } from '@/app/api/_lib/refresh';
import { ensureBootstrap, resetBootstrapCache } from '@/lib/train/bootstrap';
import { getMubit } from '@/lib/mubit';

process.env.MOCK_LATENCY_SCALE = '1'; // eval must be fast regardless (withMockFast)
process.env.MUBIT_ENABLED = 'false';
delete process.env.DATABASE_URL;

describe('held-out suite (§13.1)', () => {
  it('seed pools are disjoint', () => {
    expect(() => assertDisjointPools()).not.toThrow();
    expect(TRAINING_SEEDS.max).toBeLessThan(HELDOUT_SEEDS.min);
    expect(HELDOUT_SEEDS.max).toBeLessThan(JUDGE_SEED_MIN);
    expect(seedPool(1)).toBe('training'); expect(seedPool(9047)).toBe('heldout'); expect(seedPool(10000)).toBe('judge');
  });
  it('48 runs = 12 tasks × 4 held-out seeds, 16 with a bug valid for that task', () => {
    const s = heldoutSuite();
    expect(s).toHaveLength(48);
    expect(new Set(s.map((x) => x.seed)).size).toBe(48);
    expect(s.every((x) => seedPool(x.seed) === 'heldout')).toBe(true);
    for (const t of new Set(s.map((x) => x.taskId))) expect(s.filter((x) => x.taskId === t)).toHaveLength(4);
    const bug = s.filter((x) => x.bugs.length);
    expect(bug).toHaveLength(16);
    for (const b of ['pay_button_dead', 'total_nan', 'no_order_id', 'coupon_500']) expect(bug.filter((x) => x.bugs[0] === b)).toHaveLength(4);
    for (const x of bug) expect(bugsAffecting(getTask(x.taskId), x.bugs)).toEqual(x.bugs);
    expect(bug.filter((x) => x.bugs[0] === 'coupon_500').every((x) => ['T2', 'T6', 'T8', 'T11'].includes(x.taskId))).toBe(true);
    expect(heldoutSuite()).toEqual(s); // frozen
    expect(smokeSuite()).toHaveLength(4);
  });
});

describe('eval on mock', () => {
  beforeEach(() => { resetMemoryRepo(); resetBootstrapCache(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('rejects an unknown pinned version instead of evaluating the promoted model under its name', async () => {
    const repo = resetMemoryRepo();
    await expect(startEval({ lane: 'adapted', versionId: 'missing-version', suite: 'heldout' })).rejects.toThrow(/unknown version/i);
    expect(await repo.evals.list()).toHaveLength(0);
  });

  it.each(['training', 'failed'])('rejects a %s candidate before evaluation', async (status) => {
    const repo = resetMemoryRepo();
    await repo.versions.insert({ id: 'candidate', label: 'v2', baseModel: 'open-base', examples: 9, status });
    await expect(startEval({ lane: 'adapted', versionId: 'candidate', suite: 'heldout' })).rejects.toThrow(/ready/i);
  });

  it('pins a canonical ready version even when the caller uses the remote adapter id', async () => {
    const repo = resetMemoryRepo();
    await repo.versions.insert({ id: 'candidate', mubitVersionId: 'remote-adapter', label: 'v2', baseModel: 'open-base', examples: 9, status: 'ready' });
    const ev = await startEval({ lane: 'adapted', versionId: 'remote-adapter', suite: 'heldout' });
    expect(ev.versionId).toBe('candidate');
    expect(evalConfig(ev)?.versionId).toBe('candidate');
    expect((await startEval({ lane: 'base', versionId: 'v1', suite: 'smoke' })).versionId).toBe('v1');
    await expect(startEval({ lane: 'base', versionId: 'candidate', suite: 'heldout' })).rejects.toThrow(/base/i);
    await expect(startEval({ lane: 'closed', versionId: 'candidate', suite: 'heldout' })).rejects.toThrow(/lane/i);
    await expect(startEval({ lane: 'icl', versionId: 'candidate', suite: 'heldout' })).rejects.toThrow(/lane/i);
  });

  it('pins the current adapted version at evaluation start', async () => {
    const repo = resetMemoryRepo();
    await repo.versions.insert({ id: 'current', label: 'v2', baseModel: 'open-base', examples: 9, status: 'ready' });
    await repo.versions.promote('current');
    expect((await startEval({ lane: 'adapted', versionId: null, suite: 'heldout' })).versionId).toBe('current');
  });

  it('counts model call failures as failed runs in every suite denominator', async () => {
    const repo = resetMemoryRepo();
    vi.spyOn(getMubit(), 'chat').mockRejectedValue(new Error('Provider unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ev = await runEval({ lane: 'base', versionId: 'v1', suite: 'heldout' });
    const metrics = finalMetrics(ev)!;
    expect(ev.done).toBe(48);
    expect(metrics).toMatchObject({ runs: 48, healthyRuns: 32, bugRuns: 16, verifiedSuccess: 0, bugRecall: 0, evaluationErrors: 48 });
    const runs = await repo.runs.list({ evalId: ev.id });
    expect(runs).toHaveLength(48);
    expect(runs.every((r) => r.status === 'failed' && r.correct === false)).toBe(true);
    expect(runs.every((r) => r.reason?.includes('Provider unavailable'))).toBe(true);
  });

  it('base v1 < version with all rules on verified success; runs fast', async () => {
    const repo = resetMemoryRepo();
    await repo.versions.insert({ id: 'vAll', label: 'v9', baseModel: 'open-base', examples: 99, status: 'ready', promoted: false, rules: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'BUG'] });
    const t0 = Date.now();
    const base = finalMetrics(await runEval({ lane: 'base', versionId: 'v1', suite: 'heldout' }))!;
    const all = finalMetrics(await runEval({ lane: 'adapted', versionId: 'vAll', suite: 'heldout' }))!;
    expect(Date.now() - t0).toBeLessThan(15000);
    expect(base.runs).toBe(48); expect(all.runs).toBe(48);
    expect(all.verifiedSuccess!).toBeGreaterThan(base.verifiedSuccess ?? 0);
    expect(all.bugRecall!).toBeGreaterThanOrEqual(base.bugRecall ?? 0);
    expect(all.p95LatencyMs!).toBeGreaterThanOrEqual(all.p50LatencyMs!);
    expect((await repo.runs.list({ isEval: true })).length).toBe(96);
  });

  it('bootstrap builds an honest scripted backlog and gated versions with a rising curve', async () => {
    const s = await ensureBootstrap();
    expect(s.ran).toBe(true);
    for (const r of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']) expect(s.byRule[r]).toBeGreaterThan(0);
    expect(s.byRule.R7).toBeUndefined();
    expect(s.byRule.BUG).toBeGreaterThanOrEqual(10);
    expect(s.examples).toBe(s.scripted * 9);
    const labels = s.versions.map((v) => v.label);
    expect(labels).toEqual(['v1', 'v2', 'v3', 'v4']);
    const succ = s.versions.slice(1).map((v) => v.verifiedSuccess ?? 0);
    expect(succ[2]).toBeGreaterThan(succ[0]);
    expect((await ensureBootstrap()).examples).toBe(s.examples); // idempotent
    const st = await refreshStatus(null);
    expect(st.phase).toBe('collecting');
  });
});

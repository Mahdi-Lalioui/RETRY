// plan §13.2 — server-side held-out eval (no DOM): lib/agent/sim.simulateRun over the frozen suite.
// Chunked: each advanceEval() call processes the next CHUNK runs at EVAL_CONCURRENCY, so a poll of
// /api/eval/status (or /api/refresh/status) stays well under function time limits. On the mock client the
// whole suite runs in one call with zero wall-clock delay (withMockFast) — simulated latencies are still reported.
import type { LaneId } from '@/lib/agent/types';
import { simulateRun } from '@/lib/agent/sim';
import { LANES } from '@/lib/agent/lanes';
import { repo, type Eval } from '@/lib/db';
import { findVersion } from '@/lib/db/queries';
import { getTask } from '@/lib/shop/tasks';
import { mubitMode } from '@/lib/mubit';
import { withMockFast } from '@/lib/mubit/mock';
import { suiteItems, type SuiteName } from './suite';
import { computeMetrics, EVALUATION_ERROR_PREFIX, type EvalMetrics } from './metrics';

export interface EvalConfig { lane: LaneId; versionId: string | null; suite: SuiteName; label?: string; examples?: number }
export interface EvalProgress { config: EvalConfig; final?: false; partial?: EvalMetrics | null }
export type FinalEvalMetrics = EvalMetrics & { config: EvalConfig; final: true; finishedAt: string };
export type EvalMetricsField = EvalProgress | FinalEvalMetrics;

export const CHUNK = Number(process.env.EVAL_CHUNK ?? 8);
const concurrency = () => Math.max(1, Number(process.env.EVAL_CONCURRENCY ?? 4));

export function evalConfig(ev: Eval): EvalConfig | null {
  return ((ev.metrics ?? {}) as { config?: EvalConfig }).config ?? null;
}
export function isFinished(ev: Eval): boolean {
  return (ev.done ?? 0) >= (ev.total ?? 0) && !!(ev.metrics as FinalEvalMetrics | null)?.final;
}
export function finalMetrics(ev: Eval | null | undefined): FinalEvalMetrics | null {
  const m = ev?.metrics as FinalEvalMetrics | null | undefined;
  return m && m.final ? m : null;
}

export async function startEval(config: EvalConfig): Promise<Eval> {
  if (config.lane === 'closed' || config.lane === 'icl') {
    if (config.versionId !== null) throw new Error(`The ${config.lane} lane cannot evaluate an adapted version`);
  } else {
    const v = config.versionId
      ? await findVersion(config.versionId)
      : config.lane === 'base' ? await findVersion('v1') : await repo.versions.current();
    if (!v) throw new Error(`Unknown version ${config.versionId ?? config.lane}`);
    if (v.status !== 'ready') throw new Error(`Version ${v.label} is not ready for evaluation`);
    if (config.lane === 'base' && v.id !== 'v1') throw new Error('The base lane cannot evaluate an adapted version');
    // Pin the canonical local identity before any chunks run. A later promotion must not
    // change the model being measured or label another version's results as this one.
    config = { ...config, versionId: v.id, label: config.label ?? v.label, examples: v.examples ?? 0 };
  }
  return repo.evals.insert({
    versionId: config.versionId, lane: config.lane, total: suiteItems(config.suite).length, done: 0,
    metrics: { config } satisfies EvalProgress, createdAt: new Date(),
  });
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const it = items[i++]; await fn(it); }
  }));
}

const g = globalThis as unknown as { __evalLocks?: Map<string, Promise<Eval>> };
const locks = () => (g.__evalLocks ??= new Map());

/** Process the next chunk (whole suite on mock). Concurrent callers share one in-flight advance. */
export function advanceEval(ev: Eval, opts: { all?: boolean } = {}): Promise<Eval> {
  const l = locks();
  const inflight = l.get(ev.id);
  if (inflight) return inflight;
  const p = doAdvance(ev, opts).finally(() => l.delete(ev.id));
  l.set(ev.id, p);
  return p;
}

async function doAdvance(ev0: Eval, opts: { all?: boolean }): Promise<Eval> {
  const ev = (await repo.evals.get(ev0.id)) ?? ev0;
  const config = evalConfig(ev);
  if (!config || isFinished(ev)) return ev;
  const items = suiteItems(config.suite);
  const done = ev.done ?? 0;
  const mock = mubitMode() === 'mock';
  const size = opts.all || mock ? items.length : CHUNK;
  const slice = items.slice(done, done + size);
  const modelRef = config.versionId ? { ...LANES[config.lane].modelRef(), versionId: config.versionId } : undefined;
  const work = () => pool(slice, mock ? 8 : concurrency(), async (it) => {
    const runId = `${ev.id}_${String(it.idx).padStart(2, '0')}`;
    try {
      await simulateRun({
        task: getTask(it.taskId), seed: it.seed, versionIndex: 1, bugs: it.bugs, lane: config.lane, modelRef,
        persist: true, evalId: ev.id, runId,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[eval]', ev.id, it.idx, message);
      // An unavailable provider or failed simulation is still a failed trial. Never remove
      // it from the denominator while claiming that all scheduled runs were evaluated.
      const steps = await repo.steps.list({ runId });
      await repo.runs.insert({
        id: runId, lane: config.lane, model: (modelRef ?? LANES[config.lane].modelRef()).model,
        versionId: config.versionId, taskId: it.taskId, seed: it.seed, layoutTag: 'layout-v1', bugs: it.bugs,
        status: 'failed', correct: false, reason: `${EVALUATION_ERROR_PREFIX}${message}`, violations: [],
        steps: steps.length, isEval: true, evalId: ev.id, endedAt: new Date(),
      });
    }
  });
  await (mock ? withMockFast(work) : work());
  const newDone = Math.min(items.length, done + slice.length);
  const runs = await repo.runs.list({ evalId: ev.id });
  const finished = newDone >= items.length;
  const lat = finished ? await stepLatencies(runs.map((r) => r.id)) : [];
  const m = computeMetrics(config.lane, config.versionId, runs, lat);
  const metrics: EvalMetricsField = finished
    ? { ...m, suite: config.suite, label: config.label, examples: config.examples, config, final: true, finishedAt: new Date().toISOString() }
    : { config, partial: m };
  return (await repo.evals.update(ev.id, { done: newDone, metrics })) ?? ev;
}

async function stepLatencies(runIds: string[]): Promise<number[]> {
  const out: number[] = [];
  for (const id of runIds) for (const s of await repo.steps.list({ runId: id })) if (typeof s.latencyMs === 'number') out.push(s.latencyMs);
  return out;
}

/** Run an eval to completion in this invocation (scripts, bootstrap, mock). */
export async function runEval(config: EvalConfig): Promise<Eval> {
  let ev = await startEval(config);
  while (!isFinished(ev)) {
    const before = ev.done ?? 0;
    ev = await advanceEval(ev, { all: true });
    if ((ev.done ?? 0) === before && !isFinished(ev)) break;
  }
  return ev;
}

/** Latest finished eval for a (lane, version) pair. */
export async function latestFinished(f: { lane?: string; versionId?: string | null; suite?: SuiteName }): Promise<Eval | null> {
  const all = await repo.evals.list(f.lane ? { lane: f.lane } : {});
  return all.find((e) => isFinished(e) && (f.versionId === undefined || (e.versionId ?? null) === f.versionId)
    && (!f.suite || evalConfig(e)?.suite === f.suite)) ?? null;
}

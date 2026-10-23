// Version lifecycle shared by /api/refresh and /api/refresh/status.
// collecting → training → evaluating (held-out eval, §13) → promoted | held_back (gate, §13.4). Owned by Agent D since the gate.
import { nanoid } from 'nanoid';
import { repo, type Eval, type ModelVersion } from '@/lib/db';
import { learnedFromCorrections, nextVersionLabel } from '@/lib/db/queries';
import { getMubit, mubitMode } from '@/lib/mubit';
import { cfg } from '@/lib/mubit/config';
import { advanceEval, finalMetrics, isFinished, latestFinished, startEval, type EvalConfig } from '@/lib/eval/runner';
import { gate } from '@/lib/eval/gate';

export type RefreshPhase = 'collecting' | 'training' | 'evaluating' | 'promoted' | 'held_back';
export interface GateDecision { pass: boolean; reasons: string[]; headline: string; comparedTo: string | null }
export interface RefreshStatus {
  phase: RefreshPhase; progress: number; version?: ModelVersion; queued: number; needed: number; mode: 'real' | 'mock';
  /** evaluating: held-out runs done / total (candidate + the promoted baseline when it had no eval yet). */
  eval?: { done: number; total: number; evalId: string; baselineEvalId?: string };
  /** promoted | held_back: the gate decision. */
  gate?: GateDecision;
}

export async function startRefresh(): Promise<{ jobId: string | null; mode: 'explicit' | 'automatic'; versionId: string }> {
  const mubit = getMubit();
  const r = await mubit.requestRefresh();
  if (mubitMode() === 'mock' && r.jobId) return { ...r, versionId: r.jobId }; // mock created the row itself
  // Real Mubit: track the version in our DB (mubitVersionId filled when Mubit reports it ready).
  const existing = (await repo.versions.list({ status: 'training' }))[0];
  if (existing) return { ...r, versionId: existing.id };
  const all = await repo.corrections.list();
  const label = await nextVersionLabel();
  const v = await repo.versions.insert({
    id: `ver_${label}_${nanoid(4)}`, label, baseModel: cfg().openBaseModel, examples: all.length, status: 'training',
    rules: learnedFromCorrections(all), jobId: r.jobId, createdAt: new Date(),
  });
  return { ...r, versionId: v.id };
}

async function queuedCount(): Promise<number> {
  return (await repo.corrections.list()).filter((c) => !c.versionId).length;
}

/** Eval config for a version: v1 / zero-example versions are the base model. */
export function versionEvalConfig(v: ModelVersion): EvalConfig {
  const base = (v.examples ?? 0) === 0;
  return { lane: base ? 'base' : 'adapted', versionId: v.id, suite: 'heldout', label: v.label, examples: v.examples ?? 0 };
}

/** Finished or in-progress held-out eval for a version; starts one if none exists. */
async function evalFor(v: ModelVersion): Promise<Eval> {
  const done = await latestFinished({ versionId: v.id, suite: 'heldout' });
  if (done) return done;
  const running = (await repo.evals.list({ versionId: v.id }))
    .find((e) => !isFinished(e) && (e.metrics as { config?: EvalConfig } | null)?.config?.suite === 'heldout');
  return running ?? startEval(versionEvalConfig(v));
}

/** Make sure a version has a finished held-out eval (baselines, scripts). */
export async function ensureVersionEval(v: ModelVersion): Promise<Eval> {
  let ev = await evalFor(v);
  while (!isFinished(ev)) {
    const d = ev.done ?? 0;
    ev = await advanceEval(ev, { all: true });
    if ((ev.done ?? 0) === d && !isFinished(ev)) break;
  }
  return ev;
}

type VMetrics = { gate?: GateDecision } | null;

export async function refreshStatus(jobId?: string | null): Promise<RefreshStatus> {
  const c = cfg();
  const mode = mubitMode();
  const needed = c.refreshMinExamples;
  const all = await repo.versions.list();
  let v = jobId ? all.find((x) => x.id === jobId || x.jobId === jobId) : undefined;
  if (!v) v = all.filter((x) => x.status === 'training').pop();
  if (!v) v = all.filter((x) => x.status === 'ready' && !x.promoted && !x.heldBackReason && !(x.metrics as VMetrics)?.gate && x.id !== 'v1').pop();
  const queued = await queuedCount();
  if (!v) return { phase: 'collecting', progress: Math.min(1, queued / needed), queued, needed, mode };

  if (v.status === 'training') {
    const info = await getMubit().refreshStatus(mode === 'mock' ? v.id : v.jobId ?? null);
    if (mode === 'real' && info?.status === 'ready') {
      v = (await repo.versions.update(v.id, { status: 'ready', readyAt: new Date(), mubitVersionId: info.versionId })) ?? v;
      for (const x of (await repo.corrections.list()).filter((y) => !y.versionId && new Date(y.createdAt ?? 0) <= new Date(v!.createdAt ?? 0))) {
        await repo.corrections.update(x.id, { status: 'trained', versionId: v.id });
      }
    } else if (mode === 'real' && info?.status === 'failed') {
      v = (await repo.versions.update(v.id, { status: 'failed' })) ?? v;
    } else {
      v = (await repo.versions.get(v.id)) ?? v;
    }
    if (v.status === 'training') {
      const elapsed = (Date.now() - new Date(v.createdAt ?? 0).getTime()) / 1000;
      const est = mode === 'mock' ? c.mockTrainSeconds : Number(process.env.MUBIT_EST_TRAIN_SECONDS ?? 120);
      return { phase: 'training', progress: info?.progress ?? Math.min(0.99, elapsed / Math.max(1, est)), version: v, queued, needed, mode };
    }
  }
  if (v.status === 'failed') return { phase: 'held_back', progress: 1, version: v, queued, needed, mode };
  const stored = (v.metrics as VMetrics)?.gate;
  if (v.heldBackReason) return { phase: 'held_back', progress: 1, version: v, queued, needed, mode, gate: stored };
  if (stored) return { phase: v.promoted || stored.pass ? 'promoted' : 'held_back', progress: 1, version: v, queued, needed, mode, gate: stored };
  if (v.promoted && v.id === 'v1') return { phase: 'promoted', progress: 1, version: v, queued, needed, mode };

  // ---- evaluating ----
  const prev = await repo.versions.current();
  const baseline = prev && prev.id !== v.id ? prev : null;
  let bEval = baseline ? await evalFor(baseline) : null;
  let cEval = await evalFor(v);
  if (bEval && !isFinished(bEval)) bEval = await advanceEval(bEval);
  if ((!bEval || isFinished(bEval) || mode === 'mock') && !isFinished(cEval)) cEval = await advanceEval(cEval);
  const doneN = (cEval.done ?? 0) + (bEval && bEval.id ? (bEval.done ?? 0) : 0);
  const totalN = (cEval.total ?? 0) + (bEval ? (bEval.total ?? 0) : 0);
  const evalInfo = { done: doneN, total: totalN, evalId: cEval.id, baselineEvalId: bEval?.id };
  if (!isFinished(cEval) || (bEval && !isFinished(bEval))) {
    return { phase: 'evaluating', progress: totalN ? doneN / totalN : 0, version: v, queued, needed, mode, eval: evalInfo };
  }
  const next = finalMetrics(cEval)!;
  const prevM = bEval ? finalMetrics(bEval) : null;
  const g = gate(next, prevM);
  const decision: GateDecision = { ...g, comparedTo: baseline?.label ?? null };
  const metrics = { ...next, gate: decision, evalId: cEval.id, baselineEvalId: bEval?.id ?? null };
  if (g.pass) {
    await repo.versions.update(v.id, { metrics });
    v = (await repo.versions.promote(v.id)) ?? v;
  } else {
    v = (await repo.versions.update(v.id, { metrics, heldBackReason: g.headline })) ?? v;
  }
  return { phase: g.pass ? 'promoted' : 'held_back', progress: 1, version: v, queued, needed, mode, eval: evalInfo, gate: decision };
}

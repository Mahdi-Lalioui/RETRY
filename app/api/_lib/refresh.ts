// Version lifecycle shared by /api/refresh and /api/refresh/status.
// collecting → training → evaluating (held-out eval, §13) → promoted | held_back (gate, §13.4). Owned by Agent D since the gate.
import { nanoid } from 'nanoid';
import { repo, type Eval, type ModelVersion } from '@/lib/db';
import { learnedFromCorrections, nextVersionLabel } from '@/lib/db/queries';
import { getMubit, mubitMode } from '@/lib/mubit';
import { cfg } from '@/lib/mubit/config';
import { advanceEval, finalMetrics, isFinished, latestFinished, startEval, type EvalConfig } from '@/lib/eval/runner';
import { gate } from '@/lib/eval/gate';
import { suiteItems } from '@/lib/eval/suite';

export type RefreshPhase = 'collecting' | 'training' | 'evaluating' | 'promoted' | 'held_back';
export interface GateDecision { pass: boolean; reasons: string[]; headline: string; comparedTo: string | null }
export interface RefreshStatus {
  phase: RefreshPhase; progress: number; version?: ModelVersion; queued: number; needed: number; mode: 'real' | 'mock';
  /** evaluating: held-out runs done / total (candidate + the promoted baseline when it had no eval yet). */
  eval?: { done: number; total: number; evalId: string; baselineEvalId?: string };
  /** promoted | held_back: the gate decision. */
  gate?: GateDecision;
}

export async function startRefresh(): Promise<{ jobId: string | null; mode: 'explicit' | 'automatic'; versionId: string; skipped?: string }> {
  // [G] A version trained on zero new corrections is a duplicate (and costs a real Mubit job): refuse it.
  const training = (await repo.versions.list({ status: 'training' }))[0];
  if (!training && mubitMode() === 'mock' && (await queuedCount()) === 0) {
    const cur = await repo.versions.current();
    return { jobId: null, mode: 'automatic', versionId: cur?.id ?? 'v1', skipped: 'No new corrections since the last version' };
  }
  const mubit = getMubit();
  const mode = mubitMode();
  const existing = (await repo.versions.list({ status: 'training' }))[0];
  if (existing) return { jobId: existing.jobId, mode: existing.jobId ? 'explicit' : 'automatic', versionId: existing.id };
  const all = (await repo.corrections.list()).filter((c) => c.status === 'sent' || c.status === 'trained');
  if (mode === 'real' && !all.some((c) => c.status === 'sent' && !c.versionId)) {
    throw new Error('No new corrections have been delivered to Mubit. Wait for feedback submission or retry failed corrections before refreshing.');
  }
  // Automatic refresh has no job identity. Snapshot the remote versions before triggering it,
  // so an old ready adapter cannot be mistaken for the result of this request.
  const knownVersions = mode === 'real' ? await mubit.listVersions() : [];
  const r = await mubit.requestRefresh();
  if (mode === 'mock' && r.jobId) return { ...r, versionId: r.jobId }; // mock created the row itself
  // Real Mubit: track the version in our DB (mubitVersionId filled when Mubit reports it ready).
  const label = await nextVersionLabel();
  const v = await repo.versions.insert({
    id: `ver_${label}_${nanoid(4)}`, label, baseModel: cfg().openBaseModel, examples: all.length, status: 'training',
    rules: learnedFromCorrections(all), jobId: r.jobId, createdAt: new Date(),
    metrics: { refresh: { existingVersionIds: knownVersions.map((v) => v.versionId), correctionIds: all.map((c) => c.id) } },
  });
  return { ...r, versionId: v.id };
}

async function queuedCount(): Promise<number> {
  return (await repo.corrections.list()).filter((c) => !c.versionId).length;
}

/** Only the seeded v1 is the base model; every candidate must evaluate its adapter. */
export function versionEvalConfig(v: ModelVersion): EvalConfig {
  const base = v.id === 'v1';
  return { lane: base ? 'base' : 'adapted', versionId: v.id, suite: 'heldout', label: v.label, examples: v.examples ?? 0 };
}

/** Finished or in-progress held-out eval for a version; starts one if none exists. */
async function evalFor(v: ModelVersion): Promise<Eval> {
  const config = versionEvalConfig(v);
  const items = suiteItems(config.suite);
  const bugRuns = items.filter((item) => item.bugs.length).length;
  const done = await latestFinished({ lane: config.lane, versionId: v.id, suite: config.suite });
  const metrics = finalMetrics(done);
  if (done && metrics && done.total === items.length && metrics.suite === config.suite
    && metrics.config?.lane === config.lane && metrics.config?.versionId === v.id
    && metrics.runs === items.length && metrics.bugRuns === bugRuns && metrics.healthyRuns === items.length - bugRuns) return done;
  const running = (await repo.evals.list({ versionId: v.id }))
    .find((e) => !isFinished(e) && e.lane === config.lane && e.total === items.length
      && (e.metrics as { config?: EvalConfig } | null)?.config?.suite === config.suite
      && (e.metrics as { config?: EvalConfig } | null)?.config?.versionId === v.id);
  return running ?? startEval(config);
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

type VMetrics = { gate?: GateDecision; refresh?: { existingVersionIds?: string[]; correctionIds?: string[] } } | null;

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
  if (mode === 'real' && v.id !== 'v1' && (v.examples ?? 0) <= 0) {
    v = (await repo.versions.update(v.id, { status: 'failed', heldBackReason: 'No delivered correction examples were recorded for this model update' })) ?? v;
    return { phase: 'held_back', progress: 1, version: v, queued, needed, mode };
  }

  const wasTraining = v.status === 'training';
  if (v.status === 'training') {
    let info = await getMubit().refreshStatus(mode === 'mock' ? v.id : v.jobId ?? null);
    if (mode === 'real' && info) {
      const known = (v.metrics as VMetrics)?.refresh?.existingVersionIds;
      const used = all.some((x) => x.id !== v!.id && x.mubitVersionId === info!.versionId);
      // A legacy automatic job with no recorded snapshot cannot safely identify its result.
      if (known?.includes(info.versionId) || used || (!v.jobId && !known)) info = null;
    }
    if (mode === 'real' && info?.status === 'ready') {
      v = (await repo.versions.update(v.id, { status: 'ready', readyAt: new Date(), mubitVersionId: info.versionId })) ?? v;
      const submitted = new Set((v.metrics as VMetrics)?.refresh?.correctionIds ?? []);
      for (const x of (await repo.corrections.list()).filter((y) => !y.versionId && y.status === 'sent' && submitted.has(y.id))) {
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
  // Agent E: the poll on which training finishes reports 'evaluating' (eval not advanced yet), so the Training Ring
  // visibly passes through "evaluating on 48 held-out runs" even on the instant mock.
  if (wasTraining) {
    const ce = await evalFor(v);
    return { phase: 'evaluating', progress: 0, version: v, queued, needed, mode, eval: { done: 0, total: ce.total ?? 48, evalId: ce.id } };
  }
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

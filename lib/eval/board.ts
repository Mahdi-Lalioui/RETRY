// Held-out scoreboard + learning curves built from finished evals (plan §13.3, §14.3 Scoreboard/LearningCurve, §15 /lab).
import { repo, type Eval, type ModelVersion } from '@/lib/db';
import { mubitMode } from '@/lib/mubit';
import { evalConfig, finalMetrics, isFinished, latestFinished, runEval, advanceEval, startEval, type FinalEvalMetrics } from './runner';

export type BoardRow = FinalEvalMetrics & { evalId: string; label: string };
export interface CurvePoint {
  versionId: string; label: string; corrections: number; verifiedSuccess: number | null; bugRecall: number | null;
  lane: string; status: 'promoted' | 'held_back' | 'current' | 'evaluated'; evalId: string;
  promptChars: number | null; p50LatencyMs: number | null; costPerRunUsd: number | null; falseAlarms: number;
}
export interface IclPoint { corrections: number; verifiedSuccess: number | null; p50LatencyMs: number | null; promptChars: number | null; costPerRunUsd: number | null; evalId: string }

const LANE_ORDER = ['closed', 'base', 'adapted', 'icl'];

function row(e: Eval, label: string): BoardRow {
  return { ...(finalMetrics(e) as FinalEvalMetrics), evalId: e.id, label };
}

export async function heldoutBoard(): Promise<{ rows: BoardRow[]; curve: CurvePoint[]; icl: IclPoint[]; current: ModelVersion }> {
  const evals = (await repo.evals.list()).filter(isFinished);
  const versions = await repo.versions.list();
  const current = await repo.versions.current();
  const pick = (f: (e: Eval) => boolean) => evals.find((e) => f(e) && evalConfig(e)?.suite === 'heldout') ?? evals.find(f);
  const rows: BoardRow[] = [];
  const closed = pick((e) => e.lane === 'closed');
  if (closed) rows.push(row(closed, 'GPT · closed'));
  const base = pick((e) => e.lane === 'base');
  if (base) rows.push(row(base, 'Base · open v1'));
  const adapted = current && current.id !== 'v1' ? pick((e) => e.lane === 'adapted' && e.versionId === current.id) : undefined;
  if (adapted) rows.push(row(adapted, `RETRY · open ${current.label}`));
  const icl = pick((e) => e.lane === 'icl');
  if (icl) rows.push(row(icl, 'ICL · open v1 + examples'));
  rows.sort((a, b) => LANE_ORDER.indexOf(a.lane) - LANE_ORDER.indexOf(b.lane));

  const curve: CurvePoint[] = [];
  for (const v of versions) {
    const e = evals.find((x) => x.versionId === v.id && evalConfig(x)?.suite === 'heldout');
    if (!e) continue;
    const m = finalMetrics(e)!;
    const gate = (v.metrics as { gate?: { pass: boolean } } | null)?.gate;
    curve.push({
      versionId: v.id, label: v.label, corrections: v.examples ?? 0, verifiedSuccess: m.verifiedSuccess, bugRecall: m.bugRecall,
      lane: e.lane ?? 'adapted', evalId: e.id, promptChars: m.promptChars, p50LatencyMs: m.p50LatencyMs, costPerRunUsd: m.costPerRunUsd, falseAlarms: m.falseAlarms,
      status: v.id === current?.id ? 'current' : v.heldBackReason || gate?.pass === false ? 'held_back' : gate?.pass ? 'promoted' : 'evaluated',
    });
  }
  const iclPts: IclPoint[] = evals.filter((e) => e.lane === 'icl' && evalConfig(e)?.suite === 'heldout').map((e) => {
    const m = finalMetrics(e)!;
    return { corrections: evalConfig(e)?.examples ?? 0, verifiedSuccess: m.verifiedSuccess, p50LatencyMs: m.p50LatencyMs, promptChars: m.promptChars, costPerRunUsd: m.costPerRunUsd, evalId: e.id };
  }).sort((a, b) => a.corrections - b.corrections);
  return { rows, curve, icl: iclPts, current };
}

/**
 * Baselines so the scoreboard is never empty: held-out evals for GPT (closed) and Base v1. On mock they run to
 * completion right away (seconds); on real Mubit each call advances one chunk.
 */
export async function ensureBaselines(): Promise<void> {
  const mock = mubitMode() === 'mock';
  const targets = [
    { lane: 'closed' as const, versionId: null, label: 'GPT' },
    { lane: 'base' as const, versionId: 'v1', label: 'v1' },
  ];
  for (const t of targets) {
    if (await latestFinished({ lane: t.lane, versionId: t.versionId, suite: 'heldout' })) continue;
    if (mock) { await runEval({ lane: t.lane, versionId: t.versionId, suite: 'heldout', label: t.label, examples: 0 }); continue; }
    const running = (await repo.evals.list({ lane: t.lane })).find((e) => !isFinished(e) && (e.versionId ?? null) === t.versionId);
    await advanceEval(running ?? (await startEval({ lane: t.lane, versionId: t.versionId, suite: 'heldout', label: t.label, examples: 0 })));
  }
}

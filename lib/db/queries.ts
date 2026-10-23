// Higher-level queries on top of `repo` (aggregates, learned rules, ICL examples).
import { repo } from './index';
import type { Correction, LearnedTag, ModelVersion, Run } from './schema';
import type { LaneId } from '@/lib/agent/types';
import { formatIclExample } from '@/lib/agent/prompt';

const RULE_IDS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'] as const;

/** Learned tags from a training set: every rule with ≥1 correction, plus 'BUG' if any report_bug correction. */
export function learnedFromCorrections(cs: Pick<Correction, 'rule' | 'goodAction'>[]): LearnedTag[] {
  const out = new Set<LearnedTag>();
  for (const c of cs) {
    if (c.rule && (RULE_IDS as readonly string[]).includes(c.rule)) out.add(c.rule as LearnedTag);
    if (c.goodAction?.type === 'report_bug' || c.rule === 'BUG') out.add('BUG');
  }
  return [...RULE_IDS, 'BUG' as const].filter((t) => out.has(t));
}

/** Find a version by our id, Mubit id or label. */
export async function findVersion(idOrLabel: string): Promise<ModelVersion | null> {
  const direct = await repo.versions.get(idOrLabel);
  if (direct) return direct;
  const all = await repo.versions.list();
  return all.find((v) => v.mubitVersionId === idOrLabel || v.label === idOrLabel) ?? null;
}

export async function nextVersionLabel(): Promise<string> {
  const all = await repo.versions.list();
  const max = all.reduce((m, v) => Math.max(m, Number(v.label.replace(/^v/, '')) || 0), 0);
  return `v${max + 1}`;
}

/** ICL lane examples: every stored correction (newest-first, capped), formatted as "situation → action". */
export async function loadIclExamples(limit = Number(process.env.ICL_MAX_EXAMPLES ?? 400)): Promise<string[]> {
  const cs = await repo.corrections.list({ limit });
  return cs.reverse().map((c) => formatIclExample({ rule: c.goodAction.type === 'report_bug' ? (c.rule ?? 'BUG') : c.rule, messages: c.messages, goodAction: c.goodAction }));
}

export interface ScoreboardRow {
  lane: LaneId | string; versionId: string | null; runs: number;
  verifiedSuccess: number | null; bugRecall: number | null; falseAlarms: number;
  violationsPerRun: number | null; rescuesPer10: number | null; stepsPerRun: number | null;
  p50LatencyMs: number | null; costPerRunUsd: number | null; promptChars: number | null;
}
export interface CurvePoint { versionId: string; label: string; corrections: number; verifiedSuccess: number | null; lane: string }

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Aggregate finished runs (status != running) into one scoreboard row. */
export function aggregateRuns(lane: string, runs: Run[], humanRescues = 0): ScoreboardRow {
  const done = runs.filter((r) => r.status !== 'running');
  const healthy = done.filter((r) => !r.bugs?.length);
  const buggy = done.filter((r) => r.bugs?.length);
  const costs = done.map((r) => r.costUsd).filter((x): x is number => typeof x === 'number');
  return {
    lane, versionId: done[0]?.versionId ?? null, runs: done.length,
    verifiedSuccess: healthy.length ? healthy.filter((r) => r.status === 'passed' && r.correct).length / healthy.length : null,
    bugRecall: buggy.length ? buggy.filter((r) => r.status === 'bug_reported').length / buggy.length : null,
    falseAlarms: healthy.filter((r) => r.status === 'bug_reported' || /false alarm/i.test(r.reason ?? '')).length,
    violationsPerRun: done.length ? done.reduce((n, r) => n + (r.violations?.length ?? (r.status === 'violation' ? 1 : 0)), 0) / done.length : null,
    rescuesPer10: done.length ? (humanRescues / done.length) * 10 : null,
    stepsPerRun: avg(done.map((r) => r.steps ?? 0)),
    p50LatencyMs: median(done.map((r) => r.latencyP50).filter((x): x is number => typeof x === 'number')),
    costPerRunUsd: costs.length ? avg(costs) : null,
    promptChars: avg(done.map((r) => r.promptChars).filter((x): x is number => typeof x === 'number')),
  };
}

export async function liveScoreboard(): Promise<ScoreboardRow[]> {
  const runs = await repo.runs.list({ isEval: false });
  const human = await repo.corrections.list({ source: 'human' });
  const lanes = ['closed', 'base', 'adapted', 'icl'];
  return lanes.map((lane) => {
    const lr = runs.filter((r) => r.lane === lane);
    const ids = new Set(lr.map((r) => r.id));
    return aggregateRuns(lane, lr, human.filter((c) => c.runId && ids.has(c.runId)).length);
  });
}

export async function heldoutScoreboard(): Promise<{ rows: ScoreboardRow[]; curve: CurvePoint[] }> {
  const evals = await repo.evals.list();
  const versions = await repo.versions.list();
  const rows: ScoreboardRow[] = [];
  const seen = new Set<string>();
  for (const e of evals) {                       // newest first → latest eval per lane/version
    const key = `${e.lane}|${e.versionId}`;
    if (seen.has(key) || !e.metrics) continue;
    seen.add(key);
    rows.push(e.metrics as ScoreboardRow);
  }
  const curve: CurvePoint[] = [];
  for (const v of versions) {
    const ev = evals.find((e) => e.versionId === v.id && e.metrics);
    if (!ev) continue;
    curve.push({ versionId: v.id, label: v.label, corrections: v.examples ?? 0, lane: ev.lane ?? 'adapted', verifiedSuccess: (ev.metrics as ScoreboardRow).verifiedSuccess });
  }
  return { rows, curve };
}

/** Step stats for a run → fields stored on the run row at finish. */
export async function runStepStats(runId: string) {
  const steps = await repo.steps.list({ runId });
  const lat = steps.map((s) => s.latencyMs).filter((x): x is number => typeof x === 'number');
  const costs = steps.map((s) => s.costUsd).filter((x): x is number => typeof x === 'number');
  const pc = steps.map((s) => s.promptChars).filter((x): x is number => typeof x === 'number');
  return {
    steps: steps.length,
    latencyP50: median(lat),
    costUsd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
    promptChars: pc.length ? Math.round(pc.reduce((a, b) => a + b, 0) / pc.length) : null,
  };
}

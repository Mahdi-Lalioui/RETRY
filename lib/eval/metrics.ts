// plan §13.3 — wording mirrors Mubit's ("verified task success, repeated failures, latency and cost").
import type { Run } from '@/lib/db/schema';
import type { ScoreboardRow } from '@/lib/db/queries';

export interface EvalMetrics extends ScoreboardRow {
  healthyRuns: number; bugRuns: number; passed: number; bugsReported: number;
  p95LatencyMs: number | null; totalCostUsd: number | null; suite?: string; label?: string; examples?: number;
}

export type MetricKey = 'verifiedSuccess' | 'bugRecall' | 'falseAlarms' | 'violationsPerRun' | 'rescuesPer10' | 'stepsPerRun'
  | 'p50LatencyMs' | 'p95LatencyMs' | 'costPerRunUsd' | 'promptChars';

export interface MetricDef { key: MetricKey; label: string; better: 'higher' | 'lower'; fmt: (v: number | null) => string }

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const num1 = (v: number | null) => (v === null ? '—' : v.toFixed(1));
const ms = (v: number | null) => (v === null ? '—' : `${Math.round(v)} ms`);
const usd = (v: number | null) => (v === null ? 'credits' : `$${v < 0.01 ? v.toFixed(4) : v.toFixed(3)}`);
const chars = (v: number | null) => (v === null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)}k chars` : `${Math.round(v)} chars`);

/** Exact Mubit wording, in scoreboard order. */
export const METRICS: MetricDef[] = [
  { key: 'verifiedSuccess', label: 'Verified task success', better: 'higher', fmt: pct },
  { key: 'bugRecall', label: 'Bug recall', better: 'higher', fmt: pct },
  { key: 'falseAlarms', label: 'False alarms', better: 'lower', fmt: (v) => (v === null ? '—' : String(v)) },
  { key: 'violationsPerRun', label: 'Policy violations/run', better: 'lower', fmt: (v) => (v === null ? '—' : v.toFixed(2)) },
  { key: 'rescuesPer10', label: 'Rescues needed per 10 runs', better: 'lower', fmt: num1 },
  { key: 'stepsPerRun', label: 'Steps/run', better: 'lower', fmt: num1 },
  { key: 'p50LatencyMs', label: 'p50 latency/step', better: 'lower', fmt: ms },
  { key: 'p95LatencyMs', label: 'p95 latency/step', better: 'lower', fmt: ms },
  { key: 'costPerRunUsd', label: 'Cost per run', better: 'lower', fmt: usd },
  { key: 'promptChars', label: 'Prompt size', better: 'lower', fmt: chars },
];

export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[i];
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Held-out metrics for one eval. `stepLatencies` = every step's latency across the suite (p50/p95 are per STEP).
 * Rescues needed per 10 runs (held-out) = runs that ended stuck or in a policy violation — the runs a human would
 * have had to rescue (Mubit's "repeated failures").
 */
export function computeMetrics(lane: string, versionId: string | null, runs: Run[], stepLatencies: number[]): EvalMetrics {
  const done = runs.filter((r) => r.status !== 'running');
  const healthy = done.filter((r) => !(r.bugs ?? []).length);
  const buggy = done.filter((r) => (r.bugs ?? []).length);
  const passed = healthy.filter((r) => r.status === 'passed' && r.correct).length;
  const reported = buggy.filter((r) => r.status === 'bug_reported').length;
  const costs = done.map((r) => r.costUsd).filter((x): x is number => typeof x === 'number');
  const needRescue = done.filter((r) => r.status === 'stuck' || r.status === 'violation').length;
  return {
    lane, versionId, runs: done.length, healthyRuns: healthy.length, bugRuns: buggy.length, passed, bugsReported: reported,
    verifiedSuccess: healthy.length ? passed / healthy.length : null,
    bugRecall: buggy.length ? reported / buggy.length : null,
    falseAlarms: healthy.filter((r) => r.status === 'bug_reported' || /false alarm/i.test(r.reason ?? '')).length,
    violationsPerRun: done.length ? done.reduce((n, r) => n + (r.violations?.length ?? (r.status === 'violation' ? 1 : 0)), 0) / done.length : null,
    rescuesPer10: done.length ? (needRescue / done.length) * 10 : null,
    stepsPerRun: avg(done.map((r) => r.steps ?? 0)),
    p50LatencyMs: quantile(stepLatencies, 0.5),
    p95LatencyMs: quantile(stepLatencies, 0.95),
    costPerRunUsd: costs.length === done.length && costs.length ? avg(costs) : null,
    totalCostUsd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
    promptChars: avg(done.map((r) => r.promptChars).filter((x): x is number => typeof x === 'number')),
  };
}

/** Best value per metric across rows (for cyan highlighting). */
export function bestOf(rows: Partial<Record<MetricKey, number | null>>[], key: MetricKey): number | null {
  const def = METRICS.find((m) => m.key === key)!;
  const vals = rows.map((r) => r[key]).filter((v): v is number => typeof v === 'number');
  if (!vals.length) return null;
  return def.better === 'higher' ? Math.max(...vals) : Math.min(...vals);
}

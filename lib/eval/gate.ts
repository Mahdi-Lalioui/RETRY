// plan §13.4 — promotion gate. Promote only if success does not drop, bug recall does not drop,
// and false alarms grow by at most one.
export interface GateMetrics { verifiedSuccess: number | null; bugRecall: number | null; falseAlarms: number | null }
export interface GateResult { pass: boolean; reasons: string[]; headline: string }

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const EPS = 1e-9;

export function gate(next: GateMetrics, prev: GateMetrics | null): GateResult {
  if (!prev) return { pass: true, reasons: [], headline: 'PROMOTED — no previous version to compare' };
  const reasons: string[] = [];
  if (n(next.bugRecall) + EPS < n(prev.bugRecall)) reasons.push(`regression on bug detection (${pct(next.bugRecall)} < ${pct(prev.bugRecall)})`);
  if (n(next.verifiedSuccess) + EPS < n(prev.verifiedSuccess)) reasons.push(`regression on verified task success (${pct(next.verifiedSuccess)} < ${pct(prev.verifiedSuccess)})`);
  if (n(next.falseAlarms) > n(prev.falseAlarms) + 1) reasons.push(`more false alarms (${n(next.falseAlarms)} > ${n(prev.falseAlarms)} + 1)`);
  const pass = reasons.length === 0;
  return { pass, reasons, headline: pass ? 'PROMOTED — passed the held-out gate' : `HELD BACK — ${reasons[0]}` };
}

function pct(v: number | null) { return `${Math.round(n(v) * 100)}%`; }

// plan §13.4 — promotion gate. Promote only if success does not drop, bug recall does not drop,
// and false alarms grow by at most one.
import { suiteItems } from './suite';

export interface GateMetrics {
  verifiedSuccess: number | null; bugRecall: number | null; falseAlarms: number | null;
  suite?: string; runs?: number; healthyRuns?: number; bugRuns?: number; evaluationErrors?: number;
}
export interface GateResult { pass: boolean; reasons: string[]; headline: string }

const EPS = 1e-9;

function valid(m: GateMetrics): m is GateMetrics & { verifiedSuccess: number; bugRecall: number; falseAlarms: number } {
  const rate = (x: number | null) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
  if (m.evaluationErrors !== undefined && m.evaluationErrors !== 0) return false;
  if (!rate(m.verifiedSuccess) || !rate(m.bugRecall) || !Number.isInteger(m.falseAlarms) || m.falseAlarms! < 0) return false;
  const counts = [m.runs, m.healthyRuns, m.bugRuns];
  if (m.suite !== undefined || counts.some((x) => x !== undefined)) {
    if (!counts.every((x) => Number.isInteger(x) && x! > 0)) return false;
    if (m.runs !== m.healthyRuns! + m.bugRuns! || m.falseAlarms! > m.healthyRuns!) return false;
    if (m.suite !== undefined) {
      if (m.suite !== 'heldout' && m.suite !== 'smoke') return false;
      const items = suiteItems(m.suite);
      if (m.runs !== items.length || m.bugRuns !== items.filter((x) => x.bugs.length).length) return false;
    }
  }
  return true;
}

export function gate(next: GateMetrics, prev: GateMetrics | null): GateResult {
  if ((next.evaluationErrors ?? 0) > 0 || (prev?.evaluationErrors ?? 0) > 0) {
    const reason = 'evaluation infrastructure failed';
    return { pass: false, reasons: [reason], headline: `HELD BACK — ${reason}` };
  }
  if (!valid(next) || !prev || !valid(prev)) {
    const reason = 'incomplete or invalid evaluation metrics';
    return { pass: false, reasons: [reason], headline: `HELD BACK — ${reason}` };
  }
  const reasons: string[] = [];
  if (next.bugRecall + EPS < prev.bugRecall) reasons.push(`regression on bug detection (${pct(next.bugRecall)} < ${pct(prev.bugRecall)})`);
  if (next.verifiedSuccess + EPS < prev.verifiedSuccess) reasons.push(`regression on verified task success (${pct(next.verifiedSuccess)} < ${pct(prev.verifiedSuccess)})`);
  if (next.falseAlarms > prev.falseAlarms + 1) reasons.push(`more false alarms (${next.falseAlarms} > ${prev.falseAlarms} + 1)`);
  const pass = reasons.length === 0;
  return { pass, reasons, headline: pass ? 'PROMOTED — passed the held-out gate' : `HELD BACK — ${reasons[0]}` };
}

function pct(v: number) { return `${Math.round(v * 100)}%`; }

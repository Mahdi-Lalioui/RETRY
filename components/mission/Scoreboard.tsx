'use client';
import { useEffect, useRef } from 'react';
import type { LaneId } from '@/lib/agent/types';
import { useMission, type ScoreRow } from '@/lib/store/mission';
import { LANE_THEME } from '@/lib/store/lanes';
import { loadMetrics } from '@/lib/agent/loop';
import { LearningCurve } from './LearningCurve';

export function fmt(v: number | null | undefined, unit?: string): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (unit === '%') return `${Math.round(v <= 1 && v > 0 && !Number.isInteger(v) ? v * 100 : v)}%`;
  if (unit === 'ms') return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`;
  if (unit === '$') return v === 0 ? '$0' : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(3)}`;
  if (unit === 'chars') return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
  return Number.isInteger(v) ? String(v) : v.toFixed(v < 1 ? 2 : 1);
}

function CountUp({ value, unit, k, delay = 0 }: { value: number | null | undefined; unit?: string; k: number; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === null || value === undefined) { el.textContent = '—'; return; }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now() + (reduce ? 0 : delay);
    const dur = delay ? 1100 : 600;
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = reduce ? 1 : Math.max(0, Math.min(1, (t - start) / dur));
      const e = 1 - Math.pow(1 - p, 3);
      const cur = a + (value - a) * e;
      el.textContent = fmt(p >= 1 ? value : Number.isInteger(value) && unit !== '$' ? Math.round(cur) : cur, unit);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, unit, k, delay]);
  return <span ref={ref} className="tnum relative">—</span>;
}

function bestLane(row: ScoreRow, lanes: LaneId[]): LaneId | null {
  let best: LaneId | null = null;
  let bv = 0;
  for (const l of lanes) {
    const v = row.values[l];
    if (v === null || v === undefined) continue;
    if (best === null || (row.better === 'higher' ? v > bv : v < bv)) { best = l; bv = v; }
  }
  return best;
}

export function Scoreboard() {
  const rows = useMission((s) => s.rows);
  const curve = useMission((s) => s.curve);
  const scope = useMission((s) => s.scope);
  const k = useMission((s) => s.metricsKey);
  const iclOn = useMission((s) => s.iclOn);
  const adapted = useMission((s) => s.adapted.label);
  const set = useMission((s) => s.set);
  const phase = useMission((s) => s.training.phase);
  // Count-up after a promotion waits for the training ring to finish closing (≈900ms spring), then rolls.
  const promotedAt = useRef(0);
  if (phase === 'promoted' && !promotedAt.current) promotedAt.current = Date.now();
  if (phase !== 'promoted') promotedAt.current = 0;
  const cdelay = promotedAt.current ? Math.max(0, 900 - (Date.now() - promotedAt.current)) : 0;
  const lanes: LaneId[] = iclOn ? ['closed', 'base', 'adapted', 'icl'] : ['closed', 'base', 'adapted'];
  const label = (l: LaneId) => (l === 'adapted' ? `RETRY ${adapted}` : l === 'base' ? 'Base v1' : l === 'closed' ? 'GPT' : 'ICL');
  const baseSuccess = rows.find((r) => r.key === 'success' || /success/i.test(r.label))?.values.base ?? null;
  // Prompt size only differs once the ICL lane is on; hide it otherwise so the board fits at 720p.
  const displayRows = (rows.length ? rows : PLACEHOLDER).filter((r) => iclOn || !/prompt/i.test(r.label));
  // Winning column = the lane that is best on the most rows; it gets a glowing column.
  const wins: Partial<Record<LaneId, number>> = {};
  for (const r of rows) { const b = bestLane(r, lanes); if (b) wins[b] = (wins[b] ?? 0) + 1; }
  const winner = (Object.entries(wins) as [LaneId, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const colStyle = (l: LaneId, first?: boolean, last?: boolean): React.CSSProperties | undefined => l !== winner ? undefined : {
    background: 'linear-gradient(90deg, #22D3EE0a, #22D3EE14)',
    boxShadow: `inset 1px 0 0 #22D3EE40, inset -1px 0 0 #22D3EE40${first ? ', inset 0 1px 0 #22D3EE40' : ''}${last ? ', inset 0 -1px 0 #22D3EE40' : ''}`,
  };

  return (
    <section className="panel relative flex min-h-0 min-w-0 gap-3 overflow-hidden p-3">
      <div className="flex min-h-0 min-w-0 flex-[1.35] flex-col">
        <div className="flex items-center gap-2">
          <span className="panel-label">Scoreboard</span>
          <div className="ml-auto flex rounded-md border border-white/10 p-[2px] text-[11.5px]">
            {(['heldout', 'live'] as const).map((s) => (
              <button key={s} onClick={() => { set({ scope: s }); void loadMetrics(s); }}
                className={`rounded-[4px] px-1.5 py-[1px] font-mono transition-colors ${scope === s ? 'bg-white/10 text-white' : 'text-muted hover:text-white'}`}>
                {s === 'heldout' ? 'Held-out (48)' : 'Live'}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <table className="mt-1 w-full table-fixed border-separate border-spacing-0 text-[12px] 2xl:text-[14px]">
            <thead>
              <tr>
                <th className="w-[38%] pb-[3px] text-left font-normal text-faint" />
                {lanes.map((l) => (
                  <th key={l} className="whitespace-nowrap rounded-t-[6px] px-1.5 pb-[3px] pt-[2px] text-right font-mono text-[11px] font-semibold uppercase tracking-wide 2xl:text-[12px]" style={{ color: LANE_THEME[l].hex, ...colStyle(l, true), textShadow: l === winner ? '0 0 12px #22D3EE' : undefined }}>{l === winner && <span className="mr-1 hidden 2xl:inline">★</span>}{label(l)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, ri) => {
                const best = rows.length ? bestLane(row, lanes) : null;
                return (
                  <tr key={row.key} className="group">
                    <td className="truncate border-t border-white/[0.04] py-px pr-2 leading-[15px] text-white/80 2xl:py-[2px] 2xl:leading-[16px]">{row.label}</td>
                    {lanes.map((l) => {
                      const v = row.values[l];
                      const prev = row.prev?.[l];
                      const isBest = best === l;
                      const delta = prev !== null && prev !== undefined && v !== null && v !== undefined ? v - prev : null;
                      const good = delta !== null && delta !== 0 && (row.better === 'higher' ? delta > 0 : delta < 0);
                      return (
                        <td key={l} className="relative border-t border-white/[0.04] px-1.5 py-px text-right font-mono leading-[15px] 2xl:py-[2px] 2xl:leading-[16px]" style={{ color: isBest ? '#22D3EE' : '#D5DCE6', textShadow: isBest ? '0 0 12px #22D3EE66' : undefined, ...colStyle(l, false, ri === displayRows.length - 1) }}>
                          {row.unit === '%' && v !== null && v !== undefined && (
                            <span className="pointer-events-none absolute inset-y-[2px] right-1 origin-right rounded-[3px] transition-transform duration-700"
                              style={{ width: 'calc(100% - 8px)', transform: `scaleX(${Math.max(0.02, Math.min(1, v > 1 ? v / 100 : v))})`, background: `linear-gradient(90deg, transparent, ${isBest ? '#22D3EE' : LANE_THEME[l].hex}${isBest ? '38' : '24'})`, borderRight: `2px solid ${isBest ? '#22D3EE' : LANE_THEME[l].hex + '88'}` }} />
                          )}
                          {delta !== null && delta !== 0 && (
                            <span className="mr-1 text-[11px]" style={{ color: good ? '#34D399' : '#F43F5E' }}>{delta > 0 ? '▲' : '▼'}</span>
                          )}
                          <CountUp value={v} unit={row.unit} k={k} delay={l === 'adapted' ? cdelay : 0} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div data-dev className="caption hidden truncate 2xl:block">{scope === 'heldout' ? 'Held-out suite · 48 runs on seeds never used in training · best in cyan' : 'Live runs this session'}</div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-white/[0.05] pl-3">
        <div className="flex items-center gap-2">
          <span className="panel-label whitespace-nowrap">Learning curve</span>
          <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted">
            <span className="flex items-center gap-1"><span className="h-[2px] w-3 bg-learn" />RETRY</span>
            <span className="flex items-center gap-1"><span className="h-[2px] w-3 bg-icl" />ICL</span>
            <span className="flex items-center gap-1"><span className="h-px w-3 border-t border-dashed border-muted" />base</span>
          </span>
        </div>
        <div className="min-h-0 flex-1"><LearningCurve points={curve} baseLine={baseSuccess} /></div>
        <div data-dev className="caption hidden truncate 2xl:block">verified success vs cumulative corrections · one dot per version</div>
      </div>
    </section>
  );
}

const PLACEHOLDER: ScoreRow[] = [
  'Verified success', 'Bug recall', 'False alarms', 'Policy violations / run', 'Rescues / 10 runs', 'p50 latency / step', 'Cost / run', 'Prompt size',
].map((label) => ({ key: label, label, better: 'higher', values: {} }));

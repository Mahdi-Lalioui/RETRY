'use client';
import type { AgentAction } from '@/lib/agent/types';

export const STATUS_COLOR: Record<string, string> = {
  passed: '#34D399', bug_reported: '#34D399', violation: '#F43F5E', failed: '#F43F5E', stuck: '#F59E0B', running: '#3A4352',
};
export const LANE_COLOR: Record<string, string> = { closed: '#94A3B8', base: '#A78BFA', adapted: '#22D3EE', icl: '#F472B6' };
export const RULE_SHORT: Record<string, string> = {
  R1: 'Decline protection', R2: 'Coupon NIGHTSHIFT', R3: 'Collect in store', R4: 'Test card only', R5: 'Essential cookies',
  R6: 'Skip newsletter Continue', R7: 'Decline gift wrap', BUG: 'Report the bug',
};

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);

export function RuleChip({ rule, small }: { rule: string | null | undefined; small?: boolean }) {
  const r = rule ?? 'stuck';
  const bug = r === 'BUG';
  const color = bug ? '#F43F5E' : r === 'stuck' || r.startsWith('Other') ? '#7A8597' : '#F59E0B';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border mono ${small ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-[11px]'}`}
      style={{ borderColor: `${color}55`, color, background: `${color}12` }}>
      <b className="font-semibold">{r === 'stuck' ? 'STUCK' : r}</b>
      {!small && RULE_SHORT[r] && <span className="opacity-80">· {RULE_SHORT[r]}</span>}
    </span>
  );
}

const SOURCE_STYLE: Record<string, { c: string; label: string; title: string }> = {
  human: { c: '#22D3EE', label: 'human', title: 'A person clicked the right element' },
  scripted: { c: '#FACC15', label: 'scripted', title: 'Overnight backlog: correct action supplied by the solver, not a person' },
  augmented: { c: '#A78BFA', label: 'augmented', title: 'The same decision re-rendered on another training layout' },
};
export function SourceBadge({ source, count }: { source: string; count?: number }) {
  const s = SOURCE_STYLE[source] ?? { c: '#7A8597', label: source, title: source };
  return (
    <span title={s.title} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
      style={{ borderColor: `${s.c}55`, color: s.c, background: `${s.c}10` }}>
      {source === 'scripted' && <span aria-hidden>⚙</span>}
      {count !== undefined ? `×${count} ` : ''}{s.label}
    </span>
  );
}

export function actionText(a: AgentAction | null | undefined): string {
  if (!a) return '—';
  return `${a.type}${a.target ? ` ${a.target}` : ''}${a.value ? ` "${a.value}"` : ''}`;
}

export function Diff({ bad, good, labelBad, labelGood }: { bad?: AgentAction | null; good: AgentAction; labelBad?: string; labelGood?: string }) {
  return (
    <div className="mono text-[12px] leading-5">
      {bad && <div className="text-[#F43F5E]"><span className="opacity-60">- </span><span className="line-through decoration-[#F43F5E88]">{actionText(bad)}</span>{labelBad && <span className="opacity-70"> “{labelBad}”</span>}</div>}
      <div className="text-[#34D399]"><span className="opacity-60">+ </span>{actionText(good)}{labelGood && <span className="opacity-70"> “{labelGood}”</span>}</div>
    </div>
  );
}

export function Stat({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <div className="panel px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] muted">{label}</div>
      <div className="num mt-1 text-[28px] font-semibold leading-none tracking-tight" style={{ color }}>{value}</div>
      {sub && <div className="mt-1.5 text-[12px] muted">{sub}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; hint?: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="inline-flex rounded-xl border hairline bg-[#0A0D12] p-1">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`relative rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors ${value === t.id ? 'bg-[var(--rx-panel-2)] text-[var(--rx-text)] shadow-[inset_0_1px_0_#ffffff0d]' : 'muted hover:text-[var(--rx-text)]'}`}>
          {t.label}{t.hint && <span className="ml-1.5 mono text-[10px] faint">{t.hint}</span>}
        </button>
      ))}
    </div>
  );
}

/** Read a snapshot line for an element id's label (for diffs). */
export function labelFor(snapshot: string | undefined, id: string | undefined): string | undefined {
  if (!snapshot || !id) return undefined;
  const m = snapshot.match(new RegExp(`\\b${id} \\w+ "([^"]*)"`));
  return m?.[1];
}

export function snapshotOf(messages: { role: string; content: string }[] | undefined): string | undefined {
  const u = messages?.find((m) => m.role === 'user')?.content;
  return u?.split('PAGE SNAPSHOT:\n')[1]?.split('\nNext action JSON:')[0];
}

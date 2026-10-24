'use client';
// Agent H: v1 → vN timeline under the training ring. Each chip shows what that version learned (rules new vs the
// previous ready version); clicking it opens its real held-out numbers from /api/versions.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useMission } from '@/lib/store/mission';
import { RULES } from '@/lib/shop/rules';
import type { RuleId } from '@/lib/shop/state';
import { learnedDiff, useVersions, type VersionInfo } from './useVersions';

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
const num = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : v.toFixed(d));
const ruleName = (r: string) => (r === 'BUG' ? 'Reports real checkout bugs' : RULES[r as RuleId]?.title ?? r);

export function VersionRail() {
  const vs = useVersions();
  const current = useMission((s) => s.adapted.label);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  const shown = vs.map((v, i) => ({ v, i })).slice(-5);
  const sel = vs.findIndex((v) => v.label === open);
  if (!vs.length) return <div className="h-[30px] shrink-0" />;
  return (
    <div className="relative mt-1.5 flex h-[30px] shrink-0 items-center gap-1 border-t border-white/[0.06] pt-1.5">
      <span className="mr-1 hidden font-mono text-[11px] uppercase tracking-[0.14em] text-muted 2xl:inline">Versions</span>
      {shown.map(({ v, i }, n) => {
        const diff = learnedDiff(vs, i);
        const isCur = v.label === current;
        const held = !!v.heldBackReason;
        return (
          <span key={v.id} className="flex min-w-0 items-center gap-1">
            {n > 0 && <span className="h-px w-2 shrink-0 bg-white/20" />}
            <button onClick={() => setOpen(open === v.label ? null : v.label)}
              className="flex h-[22px] shrink-0 items-center gap-1 rounded-full border px-2 font-mono text-[12px] transition-colors hover:bg-white/[0.08]"
              style={{ borderColor: isCur ? '#22D3EE' : held ? '#F43F5E88' : '#ffffff26', background: isCur ? '#22D3EE1f' : open === v.label ? '#ffffff12' : 'transparent', color: isCur ? '#fff' : held ? '#FDA4AF' : '#CBD5E1', boxShadow: isCur ? '0 0 14px -2px #22D3EE88' : undefined }}>
              <b className="font-semibold">{v.label}</b>
              {v.status !== 'ready' && !held && <span className="h-1.5 w-1.5 animate-pulse-slow rounded-full bg-mubit" aria-label="building" />}
              {held ? <span className="text-fail">✕</span> : diff.length > 0 && (
                <span className="whitespace-nowrap text-learn">
                  {diff.length > 2 ? `+${diff.length}` : <><span className="2xl:hidden">+{diff.length}</span><span className="hidden 2xl:inline">{diff.map((r) => `+${r}`).join(' ')}</span></>}
                </span>
              )}
            </button>
          </span>
        );
      })}
      <AnimatePresence>
        {sel >= 0 && <Detail key={vs[sel].id} v={vs[sel]} diff={learnedDiff(vs, sel)} current={vs[sel].label === current} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </div>
  );
}

function Detail({ v, diff, current, onClose }: { v: VersionInfo; diff: string[]; current: boolean; onClose: () => void }) {
  const m = v.metrics;
  return (
    <motion.div initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="absolute bottom-[calc(100%+8px)] left-0 z-[60] w-[min(360px,90vw)] rounded-[12px] border border-learn/40 bg-[#0F141C] p-3 shadow-[0_24px_60px_-12px_#000]">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[20px] font-bold text-white">{v.label}</span>
        {current && <span className="rounded-full bg-learn/15 px-2 py-[1px] text-[11px] font-semibold text-learn">SERVING</span>}
        {v.heldBackReason && <span className="rounded-full border border-fail px-2 py-[1px] text-[11px] font-semibold text-fail">HELD BACK</span>}
        <span className="ml-auto font-mono text-[12px] text-muted">{v.label === 'v1' ? 'base model' : `${v.examples} examples`}</span>
        <button onClick={onClose} className="text-white/50 hover:text-white" aria-label="Close">✕</button>
      </div>
      <div className="mt-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Learned in this version</div>
      {diff.length ? (
        <ul className="mt-1 space-y-0.5 text-[13px] text-white/90">
          {diff.map((r) => <li key={r}><span className="mr-1.5 font-mono text-learn">{r}</span>{ruleName(r)}</li>)}
        </ul>
      ) : <div className="mt-1 text-[13px] text-white/60">{v.label === 'v1' ? 'Nothing yet — no corrections.' : 'No new rules (refined existing ones).'}</div>}
      {m ? (
        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
          {([['Success', pct(m.verifiedSuccess)], ['Bug recall', pct(m.bugRecall)], ['Viol. / run', num(m.violationsPerRun, 2)], ['Rescues / 10', num(m.rescuesPer10)]] as const).map(([l, val]) => (
            <div key={l} className="rounded-md bg-white/[0.04] px-2 py-1">
              <div className="text-[11px] leading-tight text-muted">{l}</div>
              <div className="font-mono text-[15px] font-semibold text-white">{val}</div>
            </div>
          ))}
        </div>
      ) : <div className="mt-2 text-[12px] text-muted">No held-out eval stored for this version.</div>}
      <div className="mt-2 text-[12px] text-muted">{m?.gate ? `${m.gate.headline ?? ''}${m.gate.comparedTo ? ` · vs ${m.gate.comparedTo}` : ''}` : 'Held-out suite · 48 unseen runs'}</div>
    </motion.div>
  );
}

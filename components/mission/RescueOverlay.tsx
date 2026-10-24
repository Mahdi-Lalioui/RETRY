'use client';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { LaneId } from '@/lib/agent/types';
import type { RuleId } from '@/lib/shop/state';
import { RULES } from '@/lib/shop/rules';
import { useMission } from '@/lib/store/mission';
import { bridge } from '@/lib/store/frames';
import { describeAction, resolveRescue } from '@/lib/agent/loop';
import { Kbd } from '@/components/ui/Kbd';

const RULE_IDS: RuleId[] = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'];

/** Amber rescue mode (plan §10). Sits over the lane's shop frame; clicks pass through to the iframe. */
export function RescueOverlay({ lane }: { lane: LaneId }) {
  const rescue = useMission((s) => (s.rescue?.lane === lane ? s.rescue : null));
  const set = useMission((s) => s.set);

  const patch = (p: Partial<NonNullable<typeof rescue>>) => {
    const cur = useMission.getState().rescue;
    if (cur && cur.lane === lane) set({ rescue: { ...cur, ...p } });
  };

  useEffect(() => {
    if (!rescue) return;
    return bridge.onPick(lane, (p) => {
      patch({ picked: p, value: p.role === 'textbox' ? (useMission.getState().rescue?.value ?? '') : '' });
      const a = document.activeElement;
      if (a && a.tagName === 'IFRAME') (a as HTMLElement).blur();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!rescue, lane]);

  useEffect(() => {
    if (!rescue) return;
    const onKey = (e: KeyboardEvent) => {
      const cur = useMission.getState().rescue;
      if (!cur || cur.lane !== lane) return;
      const typing = e.target instanceof HTMLInputElement;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); resolveRescue(lane, null); return; }
      if (e.key === 'Enter' && cur.picked) {
        e.preventDefault(); e.stopImmediatePropagation();
        if ((cur.picked.role === 'textbox' || cur.picked.role === 'select') && !cur.value.trim()) return;
        resolveRescue(lane, { pick: cur.picked, value: cur.value, rule: cur.rule, ruleText: cur.otherText });
        return;
      }
      if (typing || useMission.getState().breakMenu) return;
      if (/^[1-7]$/.test(e.key)) { e.stopImmediatePropagation(); patch({ rule: `R${e.key}` as RuleId }); }
      if (e.key === '0' || e.key.toLowerCase() === 'o') { e.stopImmediatePropagation(); patch({ rule: 'other' }); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!rescue, lane]);

  return (
    <AnimatePresence>
      {rescue && (
        <motion.div key="rescue" data-rescue-lane={lane} className="pointer-events-none absolute inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {/* dim + amber pulse border */}
          <div className="absolute inset-0 rounded-[8px] bg-black/25 rescue-pulse" />
          {/* banner */}
          <motion.div
            initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="absolute inset-x-2 top-2 flex items-center gap-2.5 rounded-[9px] border border-rescue bg-[#1d1405] px-3 py-1.5 shadow-[0_10px_40px_-6px_#F59E0B88]"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inset-0 animate-ping rounded-full bg-rescue" /><span className="relative h-2.5 w-2.5 rounded-full bg-rescue" /></span>
            <span className="shrink-0 whitespace-nowrap text-[14px] font-extrabold tracking-[0.08em] text-rescue 2xl:text-[17px]">RESCUE NEEDED</span>
            <span className="min-w-0 truncate text-[13px] font-medium text-[#FDE7C2] 2xl:text-[15px]">{rescue.picked ? 'Press Enter to teach RETRY' : 'Click the right element in the shop'}</span>
            {rescue.autoRule && (
              <span className="ml-auto shrink-0 rounded-md border border-fail bg-[#3a0d18] px-1.5 py-px font-mono text-[12px] font-semibold text-[#FF8FA3]">broke {rescue.autoRule}</span>
            )}
          </motion.div>
          <div className="absolute inset-x-0 bottom-2 flex justify-center">
            <span className="flex items-center gap-2 rounded-full border border-rescue/60 bg-[#1d1405] px-3 py-1 text-[12px] text-[#FDE7C2] 2xl:text-[13.5px]">
              <Kbd>click</Kbd> pick <span className="text-rescue/50">·</span> <Kbd>1–7</Kbd> tag rule <span className="text-rescue/50">·</span> <Kbd>↵</Kbd> teach <span className="text-rescue/50">·</span> <Kbd>Esc</Kbd> skip
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The teach panel shown under the shop frame while a lane awaits a rescue. */
export function RescuePanel({ lane }: { lane: LaneId }) {
  const rescue = useMission((s) => (s.rescue?.lane === lane ? s.rescue : null));
  const set = useMission((s) => s.set);
  const patch = (p: Partial<NonNullable<typeof rescue>>) => {
    const cur = useMission.getState().rescue;
    if (cur && cur.lane === lane) set({ rescue: { ...cur, ...p } });
  };
  if (!rescue) return null;
  return (
          <motion.div
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.05 }}
            className="pointer-events-auto relative mx-2.5 mb-2 mt-1.5 shrink-0 rounded-[10px] border border-rescue/40 bg-[#0D1016]/92 p-2 shadow-[0_10px_40px_-10px_#000]"
          >
            <div className="flex items-center gap-2 font-mono text-[12px] 2xl:text-[13px]">
              <span className="shrink-0 text-fail line-through decoration-fail/70">- {describeAction(rescue.badAction, rescue.badLabel)}</span>
              {rescue.picked ? (
                <span className="truncate text-pass">+ {rescue.picked.id} · {rescue.picked.role} · “{rescue.picked.label}”</span>
              ) : (
                <span className="truncate text-rescue/80 animate-pulse-slow">+ click the right element in the shop ↑</span>
              )}
            </div>
            {(rescue.picked?.role === 'textbox' || rescue.picked?.role === 'select') && (
              <input
                autoFocus
                value={rescue.value}
                onChange={(e) => patch({ value: e.target.value })}
                placeholder={rescue.picked.role === 'select' ? `value for “${rescue.picked.label}” (1–5)` : `value for “${rescue.picked.label}” (e.g. NIGHTSHIFT)`}
                className="mt-1.5 h-7 w-full rounded-md border border-rescue/40 bg-black/50 px-2 font-mono text-[12px] text-white outline-none placeholder:text-white/30 focus:border-rescue"
              />
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {RULE_IDS.map((r) => {
                const on = rescue.rule === r;
                return (
                  <button
                    key={r}
                    onClick={() => patch({ rule: on ? undefined : r })}
                    title={RULES[r]?.title}
                    className="rounded-[6px] border px-1.5 py-[2px] font-mono text-[12px] transition-colors"
                    style={{ borderColor: on ? '#F59E0B' : '#ffffff1a', background: on ? '#F59E0B26' : 'transparent', color: on ? '#FCD34D' : '#9AA4B4' }}
                  >
                    {r}{on && RULES[r] ? ` · ${RULES[r].short}` : ''}
                  </button>
                );
              })}
              <button
                onClick={() => patch({ rule: rescue.rule === 'other' ? undefined : 'other' })}
                className="rounded-[6px] border px-1.5 py-[2px] font-mono text-[12px]"
                style={{ borderColor: rescue.rule === 'other' ? '#F59E0B' : '#ffffff1a', color: rescue.rule === 'other' ? '#FCD34D' : '#9AA4B4' }}
              >
                Other
              </button>
              {rescue.rule === 'other' && (
                <input
                  autoFocus
                  value={rescue.otherText}
                  onChange={(e) => patch({ otherText: e.target.value })}
                  placeholder="describe the rule"
                  className="h-[20px] min-w-0 flex-1 rounded-[6px] border border-rescue/40 bg-black/50 px-1.5 text-[11px] text-white outline-none"
                />
              )}
              <span className="ml-auto hidden items-center gap-1 text-[10.5px] text-muted xl:flex">
                <Kbd>↵</Kbd> teach <Kbd>Esc</Kbd> skip
              </span>
            </div>
          </motion.div>
  );
}

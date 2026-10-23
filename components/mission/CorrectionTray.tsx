'use client';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { useMission } from '@/lib/store/mission';
import { CorrectionCard } from './CorrectionCard';

export function CorrectionTray() {
  const all = useMission((s) => s.corrections);
  const cards = all.filter((c) => c.landed).slice(0, 5);
  const counts = useMission((s) => s.counts);
  const adapted = useMission((s) => s.adapted.label);
  return (
    <section className="panel relative flex min-h-0 min-w-0 flex-col overflow-hidden p-3">
      <div className="flex items-center gap-2">
        <span className="panel-label">Correction tray</span>
        <a href="/corrections" className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-muted hover:text-white">Open ledger <ArrowUpRight className="h-3 w-3" /></a>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap font-mono text-[12px] text-white/85">
        <span className="tnum text-[18px] font-semibold text-white 2xl:text-[22px]">{counts.rescues}</span><span className="text-muted">rescues</span>
        <span className="text-faint">·</span>
        <span className="tnum text-white">{counts.examples}</span><span className="text-muted">examples</span>
        <span className="text-faint">·</span>
        <span className="tnum text-rescue">{counts.sinceVersion}</span><span className="text-muted">since {adapted}</span>
      </div>
      <div className="caption mt-0.5 truncate">Every human rescue becomes training data for that exact call</div>
      <div id="correction-tray-drop" className="relative mt-2 min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(180deg,#000_70%,transparent)]">
        {cards.length === 0 ? (
          <div className="flex h-full max-h-[96px] items-center justify-center rounded-[10px] border border-dashed border-white/10 text-center text-[11.5px] text-faint">
            Rescues land here — bad move ✕, right move ✓
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {cards.map((c) => (
                <motion.div key={c.id} layout initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
                  <CorrectionCard c={c} className="w-full" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  );
}

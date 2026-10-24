'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useMission } from '@/lib/store/mission';

export function ReplayBanner() {
  const mode = useMission((s) => s.mode);
  const at = useMission((s) => s.replayAt);
  const label = useMission((s) => s.replayLabel);
  const recording = useMission((s) => s.recording);
  return (
    <>
    {recording && (
      <div className="fixed right-4 top-16 z-50 flex items-center gap-1.5 rounded-full border border-fail/50 bg-black/70 px-2.5 py-1 font-mono text-[11px] font-bold text-fail">
        <span className="h-2 w-2 animate-pulse rounded-full bg-fail" /> REC · Shift+R to stop
      </div>
    )}
    <AnimatePresence>
      {mode === 'replay' && (
        <motion.div
          initial={{ height: 0, opacity: 0 }} animate={{ height: 22, opacity: 1 }} exit={{ height: 0, opacity: 0 }}
          className="relative z-20 flex shrink-0 items-center justify-center gap-2 overflow-hidden bg-gradient-to-r from-mubit/0 via-mubit/25 to-mubit/0 font-mono text-[11px] tracking-wide text-[#FFB08A]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-mubit" />
          {label ?? `REPLAY of run recorded ${at ?? 'earlier'}`} · press D for live
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}

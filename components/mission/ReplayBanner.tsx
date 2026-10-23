'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useMission } from '@/lib/store/mission';

export function ReplayBanner() {
  const mode = useMission((s) => s.mode);
  const at = useMission((s) => s.replayAt);
  return (
    <AnimatePresence>
      {mode === 'replay' && (
        <motion.div
          initial={{ height: 0, opacity: 0 }} animate={{ height: 22, opacity: 1 }} exit={{ height: 0, opacity: 0 }}
          className="relative z-20 flex shrink-0 items-center justify-center gap-2 overflow-hidden bg-gradient-to-r from-mubit/0 via-mubit/25 to-mubit/0 font-mono text-[11px] tracking-wide text-[#FFB08A]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-mubit" />
          REPLAY of run recorded {at ?? 'earlier'} · real timings · press D for live
        </motion.div>
      )}
    </AnimatePresence>
  );
}

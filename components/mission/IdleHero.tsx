'use client';
// Attract-style hero over the lane deck when nothing has run yet.
import { AnimatePresence, motion } from 'motion/react';
import { useMission } from '@/lib/store/mission';
import { getTask } from '@/lib/shop/tasks';

export function IdleHero() {
  const idle = useMission((s) => !s.running && !s.rescue && Object.values(s.lanes).every((l) => l.status === 'idle' && l.steps.length === 0));
  const taskId = useMission((s) => s.taskId);
  const n = useMission((s) => (s.iclOn ? 4 : 3));
  const task = getTask(taskId);
  return (
    <AnimatePresence>
      {idle && (
        <motion.div className="pointer-events-none absolute inset-0 z-[45] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.03, transition: { duration: 0.35 } }}>
          <div className="idle-hero relative overflow-hidden rounded-[22px] border border-white/15 px-[clamp(28px,3.5vw,64px)] py-[clamp(18px,2.4vw,40px)] text-center">
            <div className="idle-scan pointer-events-none absolute inset-0" />
            <div className="font-mono text-[clamp(11px,0.8vw,14px)] font-semibold uppercase tracking-[0.3em] text-rescue">Night shift · {n} lanes · ticket {task.id}</div>
            <div className="mt-3 flex items-center justify-center gap-[0.35em] text-[clamp(30px,3.6vw,68px)] font-bold leading-none tracking-[-0.035em] text-white">
              Press <kbd className="hero-key">R</kbd> to run the night shift
            </div>
            <div className="mx-auto mt-4 max-w-[56ch] text-[clamp(13px,1vw,18px)] leading-snug text-[#B8C1CE]">“{task.goal}” — same ticket, same shop, three testers. Watch which one knows your house rules.</div>
            <div className="mt-4 flex items-center justify-center gap-5 font-mono text-[clamp(11px,0.75vw,13px)] text-[#9AA4B4]">
              <span><kbd className="hero-key-sm">J</kbd> judge’s turn</span>
              <span><kbd className="hero-key-sm">S</kbd> ship new layout</span>
              <span><kbd className="hero-key-sm">?</kbd> how Mubit is used</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

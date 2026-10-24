'use client';
// Agent H: bug-catch mic-drop. When the RETRY lane's verdict is a real bug report, the deck flashes red and a
// "BUG REPORTED" slam lands before the ticket card slides out of the lane (BugReportCard waits for it).
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMission } from '@/lib/store/mission';
import { play } from '@/lib/store/sfx';

export function BugDrop() {
  const reduce = useReducedMotion();
  const v = useMission((s) => s.lanes.adapted.verdict);
  const vk = useMission((s) => s.lanes.adapted.verdictKey);
  const label = useMission((s) => s.adapted.label);
  const [show, setShow] = useState<string | null>(null);
  const seen = useRef(0);
  useEffect(() => {
    if (v?.status !== 'bug_reported' || vk === seen.current) return;
    seen.current = vk;
    setShow(v.reason.replace(/^Correctly reported:\s*/, ''));
    play('alert');
  }, [v, vk]);
  useEffect(() => {
    if (show === null) return;
    const t = setTimeout(() => setShow(null), reduce ? 1400 : 1700);
    return () => clearTimeout(t);
  }, [show, reduce]);
  return (
    <AnimatePresence>
      {show !== null && (
        <motion.div className="pointer-events-none absolute inset-0 z-[47] flex items-center justify-center overflow-hidden rounded-[14px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }}
          style={{ background: 'radial-gradient(ellipse at center, #1a070ccc 0%, #07080B99 70%)' }}>
          {!reduce && <motion.div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 160px 20px #F43F5E' }} initial={{ opacity: 0.9 }} animate={{ opacity: [0.9, 0.2, 0.6, 0.15] }} transition={{ duration: 1.2 }} />}
          <motion.div initial={reduce ? false : { scale: 2.4, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: -4 }} transition={{ type: 'spring', stiffness: 420, damping: 16 }}
            className="rounded-[16px] border-[6px] border-fail bg-fail px-[clamp(20px,2.6vw,48px)] py-[clamp(8px,1vw,18px)] text-center shadow-[0_0_80px_#F43F5E99]">
            <div className="text-[clamp(36px,5vw,96px)] font-black leading-none tracking-[0.02em] text-white">BUG REPORTED</div>
            <div className="mt-1.5 max-w-[60vw] truncate text-[clamp(14px,1.2vw,22px)] font-semibold text-white/95">RETRY {label}: “{show}”</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

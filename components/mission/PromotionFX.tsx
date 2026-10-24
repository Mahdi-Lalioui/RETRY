'use client';
// Cinematic promotion moment over the lane deck: light sweep across every lane, cyan particle shower, "vN promoted" plate.
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { on } from '@/lib/store/bus';
import { useMission } from '@/lib/store/mission';

export function PromotionFX() {
  const [k, setK] = useState(0);
  const reduce = useReducedMotion();
  const label = useMission((s) => s.adapted.label);
  const prev = useMission((s) => s.prevAdaptedLabel);
  useEffect(() => on('burst', () => setK((x) => x + 1)), []);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!k) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 2600);
    return () => clearTimeout(t);
  }, [k]);
  const parts = useMemo(() => Array.from({ length: 34 }, (_, i) => ({
    x: (i * 37) % 100, d: 0.25 + ((i * 13) % 10) / 22, dx: ((i * 53) % 21) - 10, s: 3 + (i % 3) * 2, dist: 70 + ((i * 29) % 90),
  })), []);
  return (
    <AnimatePresence>
      {show && (
        <motion.div key={k} className="pointer-events-none absolute inset-0 z-[46] overflow-hidden rounded-[14px]" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }}>
          {!reduce && (
            <motion.div className="absolute inset-y-0 w-[30%]" initial={{ x: '-40%' }} animate={{ x: '380%' }} transition={{ duration: 1.1, ease: [0.4, 0, 0.2, 1] }}
              style={{ background: 'linear-gradient(100deg, transparent, #22D3EE10 30%, #A5F3FC55 50%, #22D3EE10 70%, transparent)' }} />
          )}
          {!reduce && parts.map((p, i) => (
            <motion.span key={i} className="absolute rounded-full" style={{ left: `${p.x}%`, bottom: '18%', width: p.s, height: p.s, background: '#67E8F9', boxShadow: '0 0 10px #22D3EE' }}
              initial={{ y: 0, x: 0, opacity: 0 }} animate={{ y: -p.dist * 2.2, x: p.dx * 4, opacity: [0, 1, 0] }} transition={{ duration: 1.5, delay: p.d, ease: 'easeOut' }} />
          ))}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div initial={{ scale: 0.7, opacity: 0, rotateX: 50 }} animate={{ scale: 1, opacity: 1, rotateX: 0 }} transition={{ delay: 0.35, type: 'spring', stiffness: 220, damping: 18 }}
              className="promo-plate flex items-center gap-4 rounded-[18px] border border-learn/70 px-8 py-4">
              {prev && <span className="font-mono text-[clamp(22px,2.2vw,40px)] font-semibold text-white/40 line-through decoration-white/30">{prev}</span>}
              <span className="font-mono text-[clamp(22px,2.2vw,40px)] text-learn/70">→</span>
              <span className="font-mono text-[clamp(40px,4.4vw,84px)] font-bold leading-none text-white" style={{ textShadow: '0 0 30px #22D3EE' }}>{label}</span>
              <span className="flex flex-col text-left">
                <span className="text-[clamp(14px,1.2vw,22px)] font-bold uppercase tracking-[0.12em] text-learn">Promoted</span>
                <span className="text-[clamp(12px,0.85vw,15px)] text-[#B8C1CE]">passed the 48-run held-out gate</span>
              </span>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useMission } from '@/lib/store/mission';
import { play } from '@/lib/store/sfx';

const pill = 'absolute inset-0 flex items-center justify-center rounded-full border font-mono text-[11px] font-semibold [backface-visibility:hidden]';

/** Version pill. On promotion it flips in 3D (rotateY 0→180) and bursts cyan particles. */
export function VersionBadge({ label, color, live }: { label: string; color: string; live?: boolean }) {
  const flipKey = useMission((s) => s.flipKey);
  const prev = useMission((s) => s.prevAdaptedLabel);
  const reduce = useReducedMotion();
  const [flipping, setFlipping] = useState(false);
  useEffect(() => {
    if (!live || !flipKey) return;
    setFlipping(true);
    const t = setTimeout(() => setFlipping(false), 1400);
    return () => clearTimeout(t);
  }, [flipKey, live]);

  if (!live) {
    return <span className="inline-flex h-5 items-center rounded-full border px-2 font-mono text-[11px] font-semibold" style={{ color, borderColor: `${color}55`, background: `${color}12` }}>{label}</span>;
  }
  return (
    <span className="relative inline-block h-5 w-9" style={{ perspective: 600 }}>
      <motion.span
        key={flipKey}
        className="absolute inset-0 [transform-style:preserve-3d]"
        initial={{ rotateY: flipKey && !reduce ? 0 : 180 }}
        animate={{ rotateY: 180 }}
        transition={{ duration: reduce ? 0 : 0.7, ease: [0.3, 1.4, 0.5, 1] }}
        onAnimationComplete={() => flipKey && play('chime')}
      >
        <span className={pill} style={{ color: '#7A8597', borderColor: '#3A4352', background: '#12161E' }}>{prev ?? label}</span>
        <span className={pill} style={{ transform: 'rotateY(180deg)', color, borderColor: `${color}88`, background: `${color}18`, boxShadow: flipping ? `0 0 18px ${color}` : 'none' }}>{label}</span>
      </motion.span>
      {flipping && !reduce && <Burst color={color} />}
    </span>
  );
}

export function Burst({ color, n = 12, dist = 34 }: { color: string; n?: number; dist?: number }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-1/2">
      {Array.from({ length: n }, (_, i) => {
        const a = (Math.PI * 2 * i) / n;
        return (
          <motion.span
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full"
            style={{ background: color, boxShadow: `0 0 8px ${color}`, left: -3, top: -3 }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * dist, y: Math.sin(a) * dist, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.5, delay: 0.35, ease: 'easeOut' }}
          />
        );
      })}
    </span>
  );
}

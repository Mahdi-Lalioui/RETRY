'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion, AnimatePresence, type MotionValue } from 'motion/react';
import type { LaneId } from '@/lib/agent/types';
import { bridge } from '@/lib/store/frames';
import { LANE_THEME } from '@/lib/store/lanes';

/** Ghost cursor overlay. Coordinates arrive in unscaled 1280×800 shop px; `geom` maps them to the lane box. */
export function GhostCursor({ lane, geom }: { lane: LaneId; geom: React.RefObject<{ scale: number; ox: number; oy: number }> }) {
  const reduce = useReducedMotion();
  const tx = useMotionValue(-40);
  const ty = useMotionValue(-40);
  const x = useSpring(tx, { stiffness: 180, damping: 22 });
  const y = useSpring(ty, { stiffness: 180, damping: 22 });
  const [visible, setVisible] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const rid = useRef(0);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const color = LANE_THEME[lane].hex;

  useEffect(() => bridge.onCursor(lane, (c) => {
    const g = geom.current;
    if (!g) return;
    const px = g.ox + c.x * g.scale;
    const py = g.oy + c.y * g.scale;
    if (!visible) { x.jump(px - 30); y.jump(py + 40); }
    setVisible(true);
    tx.set(px); ty.set(py);
    if (reduce) { x.jump(px); y.jump(py); }
    if (c.pressed) {
      const id = ++rid.current;
      setRipples((r) => [...r.slice(-3), { id, x: px, y: py }]);
      setTimeout(() => setRipples((r) => r.filter((q) => q.id !== id)), 500);
    }
    if (hideT.current) clearTimeout(hideT.current);
    hideT.current = setTimeout(() => setVisible(false), 6000);
  }), [lane, geom, tx, ty, x, y, reduce, visible]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            className="absolute rounded-full border-2"
            style={{ left: r.x, top: r.y, borderColor: color, translateX: '-50%', translateY: '-50%' }}
            initial={{ width: 0, height: 0, opacity: 1 }}
            animate={{ width: 56, height: 56, opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>
      {visible && <Trail x={x} y={y} color={color} />}
      <motion.div className="absolute left-0 top-0" style={{ x, y, opacity: visible ? 1 : 0 }} transition={{ duration: 0.2 }}>
        <svg width="20" height="22" viewBox="0 0 16 18" style={{ filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 2px 3px #000a)`, marginLeft: -2, marginTop: -2 }}>
          <path d="M1.5 1.5 L1.5 14.5 L5 11.2 L7.6 16.6 L10 15.5 L7.5 10.3 L12.6 10.1 Z" fill={color} stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
        </svg>
        <span className="absolute left-4 top-5 whitespace-nowrap rounded-[4px] px-1 py-[1px] font-mono text-[9px] font-semibold text-black" style={{ background: color }}>
          {LANE_THEME[lane].name}
        </span>
      </motion.div>
    </div>
  );
}

function TrailDot({ x, y, i, color }: { x: MotionValue<number>; y: MotionValue<number>; i: number; color: string }) {
  const sx = useSpring(x, { stiffness: 180 - i * 22, damping: 22 + i });
  const sy = useSpring(y, { stiffness: 180 - i * 22, damping: 22 + i });
  return (
    <motion.span
      className="absolute left-0 top-0 rounded-full"
      style={{ x: sx, y: sy, width: 6 - i * 0.6, height: 6 - i * 0.6, background: color, opacity: 0.5 - i * 0.075, translateX: '-50%', translateY: '-50%' }}
    />
  );
}
function Trail({ x, y, color }: { x: MotionValue<number>; y: MotionValue<number>; color: string }) {
  return <>{[1, 2, 3, 4, 5, 6].map((i) => <TrailDot key={i} x={x} y={y} i={i} color={color} />)}</>;
}

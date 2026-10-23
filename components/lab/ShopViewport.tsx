'use client';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ShopFrame } from './shopFrame';

/** The NIGHT MARKET iframe at 1280×800, scaled to the container width, with a ghost cursor fed by retry:cursor. */
export function ShopViewport({ src, onFrame, color = '#22D3EE', children, className = '' }: {
  src: string; onFrame: (f: ShopFrame) => void; color?: string; children?: React.ReactNode; className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const ifr = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.5);
  const [cur, setCur] = useState<{ x: number; y: number; pressed: boolean } | null>(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1280));
    ro.observe(el); setScale(el.clientWidth / 1280);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = ifr.current; if (!el) return;
    const f = new ShopFrame(el);
    const off = f.on((m) => {
      if (m.type === 'retry:cursor') setCur({ x: Number(m.x), y: Number(m.y), pressed: !!m.pressed });
      if (m.type === 'retry:ready') setCur(null);
    });
    onFrameRef.current(f);
    return () => { off(); f.dispose(); };
  }, [src]);

  return (
    <div ref={wrap} className={`relative w-full overflow-hidden rounded-[10px] bg-[#FAFAF7] ${className}`} style={{ height: 800 * scale }}>
      <iframe ref={ifr} src={src} title="NIGHT MARKET" className="absolute left-0 top-0 origin-top-left border-0"
        style={{ width: 1280, height: 800, transform: `scale(${scale})` }} />
      {cur && (
        <motion.div className="pointer-events-none absolute left-0 top-0 z-20" animate={{ x: cur.x * scale, y: cur.y * scale }} transition={{ type: 'spring', stiffness: 180, damping: 22 }}>
          <svg width="20" height="20" viewBox="0 0 16 16" style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
            <path d="M1 1 L1 13 L4.5 9.8 L7 15 L9 14 L6.6 9 L11.5 9 Z" fill={color} stroke="#fff" strokeWidth="1" />
          </svg>
          {cur.pressed && <motion.span className="absolute -left-3 -top-3 h-7 w-7 rounded-full border-2" style={{ borderColor: color }} initial={{ scale: 0.2, opacity: 1 }} animate={{ scale: 1.4, opacity: 0 }} transition={{ duration: 0.4 }} />}
        </motion.div>
      )}
      {children}
    </div>
  );
}

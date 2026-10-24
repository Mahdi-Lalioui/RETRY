'use client';
// Correction cards lift off the rescued lane, travel up the Mubit pipe into the core, then drop into the tray.
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { on } from '@/lib/store/bus';
import { useMission } from '@/lib/store/mission';
import { patchCorrection } from '@/lib/agent/loop';
import { CorrectionCard } from './CorrectionCard';

interface Flight { id: string; from: DOMRect; core: DOMRect; to: DOMRect }

function rectOf(sel: string): DOMRect | null {
  const el = document.querySelector(sel);
  return el ? el.getBoundingClientRect() : null;
}

export function FlyingCards() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const reduce = useReducedMotion();
  useEffect(() => on('card', ({ id, lane }) => {
    const from = rectOf(`[data-lane-frame="${lane}"]`);
    const core = rectOf('#mubit-core');
    const to = rectOf('#correction-tray-drop');
    if (!from || !core || !to || reduce) { patchCorrection(id, { landed: true }); return; }
    setFlights((f) => [...f, { id, from, core, to }]);
  }), [reduce]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]">
      {flights.map((f) => <Flying key={f.id} f={f} done={() => { patchCorrection(f.id, { landed: true }); setFlights((xs) => xs.filter((x) => x.id !== f.id)); }} />)}
    </div>
  );
}

function Flying({ f, done }: { f: Flight; done: () => void }) {
  const c = useMission((s) => s.corrections.find((x) => x.id === f.id));
  if (!c) return null;
  const W = 280, H = 96;
  const sx = f.from.left + f.from.width / 2 - W / 2;
  const sy = f.from.top + f.from.height / 2 - H / 2;
  const cx = f.core.left + f.core.width / 2 - W / 2;
  const cy = f.core.top + f.core.height / 2 - H / 2;
  const tx = f.to.left + (f.to.width - W) / 2;
  const ty = f.to.top;
  const ts = Math.min(1, f.to.width / W);
  // Arc: lift → curve up and over toward the core (peak above the straight line) → swallowed → arc down into the tray → overshoot + settle.
  const ax = (sx + cx) / 2, ay = Math.min(sy, cy) - 70;
  const bx = (cx + tx) / 2 + (tx < cx ? -60 : 60), by = (cy + ty) / 2 - 40;
  const kf = {
    x: [sx, sx, sx, ax, cx, cx, bx, tx, tx, tx],
    y: [sy + 24, sy, sy, ay, cy, cy, by, ty + 10, ty - 3, ty],
    scale: [0.6, 1.04, 1, 0.6, 0.2, 0.2, 0.7, ts * 1.04, ts * 0.99, ts],
    rotate: [0, -2, -2, -8, 0, 0, 6, -1.5, 0.6, 0],
    opacity: [0, 1, 1, 1, 0.95, 0.95, 1, 1, 1, 1],
  };
  const times = [0, 0.1, 0.3, 0.46, 0.6, 0.68, 0.82, 0.92, 0.97, 1];
  return (
    <>
      {/* motion-blur trail: cheap amber ghosts following the same path, slightly behind */}
      {[1, 2, 3].map((i) => (
        <motion.div key={i} className="absolute left-0 top-0 rounded-[10px]" style={{ width: W, height: H, background: 'linear-gradient(90deg, #F59E0B, #F59E0B33)', opacity: 0, transformOrigin: '50% 50%' }}
          initial={{ x: sx, y: sy + 24, scale: 0.6, opacity: 0 }}
          animate={{ ...kf, opacity: [0, 0, 0.12 / i, 0.16 / i, 0.12 / i, 0, 0.1 / i, 0, 0, 0] }}
          transition={{ duration: 3.0, times, ease: 'easeInOut', delay: i * 0.045 }} />
      ))}
      <motion.div
        className="absolute left-0 top-0 rounded-[10px]"
        style={{ width: W, transformOrigin: '50% 50%', boxShadow: '0 0 40px -4px #F59E0Baa, 0 20px 50px -10px #000' }}
        initial={{ x: sx, y: sy + 24, scale: 0.6, opacity: 0 }}
        animate={kf}
        transition={{ duration: 3.0, times, ease: 'easeInOut' }}
        onAnimationComplete={done}
      >
        <CorrectionCard c={{ ...c, status: c.status === 'queued' ? 'queued' : c.status }} />
      </motion.div>
    </>
  );
}

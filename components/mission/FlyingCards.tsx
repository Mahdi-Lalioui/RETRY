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
  const tx = f.to.left;
  const ty = f.to.top;
  return (
    <motion.div
      className="absolute left-0 top-0"
      style={{ width: W, transformOrigin: '50% 50%' }}
      initial={{ x: sx, y: sy + 20, scale: 0.6, opacity: 0 }}
      animate={{
        x: [sx, sx, sx, cx, cx, tx + (f.to.width - W) / 2],
        y: [sy + 20, sy, sy, cy, cy, ty],
        scale: [0.6, 1, 1, 0.22, 0.22, Math.min(1, f.to.width / W)],
        opacity: [0, 1, 1, 0.9, 0.9, 1],
        filter: ['drop-shadow(0 0 0 #F59E0B00)', 'drop-shadow(0 0 24px #F59E0B88)', 'drop-shadow(0 0 24px #F59E0B88)', 'drop-shadow(0 0 30px #FF4500)', 'drop-shadow(0 0 30px #FF4500)', 'drop-shadow(0 0 0 #F59E0B00)'],
      }}
      transition={{ duration: 3.0, times: [0, 0.12, 0.38, 0.6, 0.7, 1], ease: 'easeInOut' }}
      onAnimationComplete={done}
    >
      <CorrectionCard c={{ ...c, status: c.status === 'queued' ? 'queued' : c.status }} />
    </motion.div>
  );
}

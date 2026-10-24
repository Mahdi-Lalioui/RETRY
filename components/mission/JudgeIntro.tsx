'use client';
// Agent H: "Judge's turn" intro over the lane deck — UNSEEN LAYOUT · seed NNNNN · never trained on, with a layout
// shuffle. The seed digits roll until judgesTurn() sets the real seed, then lock. Solid dim, no backdrop-filter.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMission } from '@/lib/store/mission';
import { getTask } from '@/lib/shop/tasks';

const BLOCKS = [
  { w: 46, h: 38 }, { w: 24, h: 38 }, { w: 24, h: 38 }, { w: 30, h: 26 }, { w: 30, h: 26 }, { w: 34, h: 26 },
];

export function JudgeIntro() {
  const reduce = useReducedMotion();
  const seed = useMission((s) => s.seed);
  const taskId = useMission((s) => s.taskId);
  const [show, setShow] = useState<{ from: number; at: number } | null>(null);
  const [roll, setRoll] = useState('00000');
  const [order, setOrder] = useState([0, 1, 2, 3, 4, 5]);
  const locked = show !== null && seed !== show.from && seed >= 10000;
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const h = (e: Event) => { setShow({ from: (e as CustomEvent).detail?.from ?? -1, at: Date.now() }); };
    window.addEventListener('retry:judge', h);
    return () => window.removeEventListener('retry:judge', h);
  }, []);
  // roll digits + shuffle blocks until the real seed lands
  useEffect(() => {
    if (!show || locked) return;
    const id = setInterval(() => {
      setRoll(String(10000 + Math.floor(Math.random() * 89999)));
      if (!reduce) setOrder((o) => [...o].sort(() => Math.random() - 0.5));
    }, 70);
    return () => clearInterval(id);
  }, [show, locked, reduce]);
  useEffect(() => {
    if (!locked) return;
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setShow(null), reduce ? 900 : 1400);
    return () => clearTimeout(hide.current);
  }, [locked, reduce]);
  // safety: never stick around
  useEffect(() => { if (!show) return; const t = setTimeout(() => setShow(null), 4000); return () => clearTimeout(t); }, [show]);

  const digits = (locked ? String(seed) : roll).split('');
  const task = getTask(taskId);
  const layout = useMemo(() => order, [order]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="pointer-events-none absolute inset-0 z-[47] flex items-center justify-center overflow-hidden rounded-[14px]"
          style={{ background: 'radial-gradient(ellipse at center, #07080B 0%, #07080Bf5 55%, #07080Be6 100%)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.35 } }}>
          <div className="flex items-center gap-[clamp(20px,3vw,56px)]">
            {/* layout shuffle: wireframe page blocks trading places */}
            <div className="relative hidden h-[clamp(120px,14vw,230px)] w-[clamp(150px,17vw,280px)] shrink-0 flex-wrap content-start gap-[6px] rounded-[12px] border border-learn/40 bg-[#0D1016] p-[8px] sm:flex">
              {layout.map((b) => (
                <motion.span key={b} layout={!reduce} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="rounded-[5px] border border-learn/40 bg-learn/10" style={{ width: `${BLOCKS[b].w}%`, height: `${BLOCKS[b].h}%`, background: locked ? '#22D3EE26' : undefined }} />
              ))}
            </div>
            <div>
              <div className="font-mono text-[clamp(12px,0.9vw,16px)] font-semibold uppercase tracking-[0.32em] text-rescue">Judge’s turn</div>
              <motion.div initial={reduce ? false : { scale: 1.25, opacity: 0, letterSpacing: '0.2em' }} animate={{ scale: 1, opacity: 1, letterSpacing: '-0.03em' }} transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className="mt-1 text-[clamp(34px,4.4vw,84px)] font-black leading-none text-white">UNSEEN LAYOUT</motion.div>
              <div className="mt-3 flex items-baseline gap-3 font-mono text-[clamp(16px,1.6vw,30px)]">
                <span className="text-muted">seed</span>
                <span className="tnum font-bold" style={{ color: locked ? '#22D3EE' : '#E8EDF5', textShadow: locked ? '0 0 24px #22D3EE' : undefined }}>
                  {digits.map((d, i) => <span key={i} className="inline-block w-[0.62em] text-center">{d}</span>)}
                </span>
                <span className="text-[0.7em] text-white/70">· never trained on</span>
              </div>
              <div className="mt-2 h-[1.4em] text-[clamp(13px,1vw,18px)] text-white/80">
                {locked && <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}><b className="font-mono text-white">{task.id}</b> · {task.goal}</motion.span>}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

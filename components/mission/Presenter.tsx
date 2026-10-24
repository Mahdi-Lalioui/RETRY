'use client';
// Agent H: presenter mode (P) hides dev-ish chrome and enlarges captions; sound toggle (M) gets a quiet toast.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useMission } from '@/lib/store/mission';

const KEY = 'retry:presenter';
export function setPresenter(on: boolean) {
  document.documentElement.classList.toggle('presenter', on);
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
  window.dispatchEvent(new CustomEvent('retry:toast', { detail: on ? 'Presenter mode on · P to exit' : 'Presenter mode off' }));
}

export function Presenter() {
  const sound = useMission((s) => s.sound);
  const [toast, setToast] = useState<{ t: string; k: number } | null>(null);
  const first = useRef(true);
  useEffect(() => {
    try { if (localStorage.getItem(KEY) === '1') document.documentElement.classList.add('presenter'); } catch { /* ignore */ }
    const h = (e: Event) => setToast({ t: String((e as CustomEvent).detail), k: Date.now() });
    window.addEventListener('retry:toast', h);
    return () => window.removeEventListener('retry:toast', h);
  }, []);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setToast({ t: sound ? 'Sound on · M to mute' : 'Sound off', k: Date.now() });
  }, [sound]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 1600); return () => clearTimeout(id); }, [toast]);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div key={toast.k} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          className="pointer-events-none fixed left-1/2 top-16 z-[80] -translate-x-1/2 rounded-full border border-white/15 bg-[#12161E] px-4 py-1.5 text-[13px] text-white shadow-[0_12px_40px_-8px_#000]">
          {toast.t}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

'use client';
// Agent H: cinematic judge's turn. Shows the intro overlay first, then calls the existing judgesTurn() (which picks the
// real unseen seed); the overlay lands its rolling seed on whatever seed judgesTurn actually chose.
import { judgesTurn } from '@/lib/agent/loop';
import { useMission } from '@/lib/store/mission';

let busy = false;
export async function judgeWithIntro() {
  if (busy) return;
  busy = true;
  try {
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.dispatchEvent(new CustomEvent('retry:judge', { detail: { from: useMission.getState().seed } }));
    await new Promise((r) => setTimeout(r, reduce ? 150 : 650));
    await judgesTurn();
  } finally { busy = false; }
}

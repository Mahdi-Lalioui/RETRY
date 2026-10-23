'use client';
import { useMission } from './mission';

export type Sfx = 'tick' | 'thunk' | 'chime' | 'alert';
const cache = new Map<Sfx, HTMLAudioElement>();
let lastTick = 0;

export function play(name: Sfx) {
  if (typeof window === 'undefined' || !useMission.getState().sound) return;
  if (name === 'tick') { const now = performance.now(); if (now - lastTick < 90) return; lastTick = now; }
  try {
    let a = cache.get(name);
    if (!a) { a = new Audio(`/sfx/${name}.wav`); a.volume = name === 'tick' ? 0.25 : 0.5; cache.set(name, a); }
    const node = a.cloneNode(true) as HTMLAudioElement;
    node.volume = a.volume;
    void node.play().catch(() => {});
  } catch { /* audio unavailable */ }
}

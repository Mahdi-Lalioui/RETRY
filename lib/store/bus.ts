// Tiny typed event bus for high-frequency visual events (particles, cursors, bursts)
// that must never trigger React re-renders of the whole tree.
import type { LaneId } from '@/lib/agent/types';

export interface BusEvents {
  call: { lane: LaneId; ms: number };
  card: { id: string; lane: LaneId };
  stamp: { lane: LaneId };
  burst: { lane: LaneId };
}
type Handler<K extends keyof BusEvents> = (e: BusEvents[K]) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers = new Map<keyof BusEvents, Set<(e: any) => void>>();

export function on<K extends keyof BusEvents>(k: K, h: Handler<K>): () => void {
  const set = handlers.get(k) ?? new Set();
  handlers.set(k, set);
  set.add(h);
  return () => { set.delete(h); };
}
export function emit<K extends keyof BusEvents>(k: K, e: BusEvents[K]) {
  handlers.get(k)?.forEach((h) => h(e));
}

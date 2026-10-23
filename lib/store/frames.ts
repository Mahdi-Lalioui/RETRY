// Parent side of the shop bridge (plan §9.7). One iframe per lane, same origin.
import type { AgentAction, LaneId, StepResult } from '@/lib/agent/types';
import type { BugId, ShopState } from '@/lib/shop/state';

export interface SnapshotRes { snapshot: string; ids: string[]; state: ShopState; layoutTag: string }
export interface ActRes { result: StepResult; state: ShopState; layoutTag: string }
export interface Pick { id: string; semKey: string; role: string; label: string }
export interface CursorMsg { x: number; y: number; pressed?: boolean }

const frames = new Map<LaneId, HTMLIFrameElement>();
const pending = new Map<string, { resolve: (d: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
const cursorSubs = new Map<LaneId, Set<(c: CursorMsg) => void>>();
const pickSubs = new Map<LaneId, Set<(p: Pick) => void>>();
let listening = false;
let seq = 0;

function laneOf(src: MessageEventSource | null): LaneId | undefined {
  for (const [lane, f] of frames) if (f.contentWindow && f.contentWindow === src) return lane;
  return undefined;
}

function ensureListener() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return;
    const d = e.data as { type?: string; reqId?: string } & Record<string, unknown>;
    if (!d || typeof d.type !== 'string' || !d.type.startsWith('retry:')) return;
    if (d.reqId && pending.has(d.reqId)) {
      const p = pending.get(d.reqId)!;
      clearTimeout(p.timer);
      pending.delete(d.reqId);
      p.resolve(d);
      return;
    }
    const lane = laneOf(e.source);
    if (!lane) return;
    if (d.type === 'retry:cursor') cursorSubs.get(lane)?.forEach((h) => h(d as unknown as CursorMsg));
    if (d.type === 'retry:pick') pickSubs.get(lane)?.forEach((h) => h(d as unknown as Pick));
  });
}

export function registerFrame(lane: LaneId, el: HTMLIFrameElement | null) {
  ensureListener();
  if (el) frames.set(lane, el);
  else frames.delete(lane);
}

function post(lane: LaneId, msg: Record<string, unknown>) {
  const w = frames.get(lane)?.contentWindow;
  if (!w) throw new Error(`lane ${lane} has no frame`);
  w.postMessage(msg, window.location.origin);
}

function request<T>(lane: LaneId, msg: Record<string, unknown>, timeoutMs: number): Promise<T> {
  ensureListener();
  const reqId = `${lane}-${++seq}`;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(reqId);
      reject(new Error(`bridge timeout: ${String(msg.type)} on ${lane}`));
    }, timeoutMs);
    pending.set(reqId, { resolve: resolve as (d: unknown) => void, timer });
    try { post(lane, { ...msg, reqId }); } catch (err) { clearTimeout(timer); pending.delete(reqId); reject(err); }
  });
}

export const bridge = {
  snapshot: (lane: LaneId) => request<SnapshotRes>(lane, { type: 'retry:snapshot' }, 4000),
  act: (lane: LaneId, action: AgentAction) => request<ActRes>(lane, { type: 'retry:act', action }, 12000),
  apply: (lane: LaneId, semKey: string, value?: string) => request<ActRes>(lane, { type: 'retry:apply', semKey, value }, 8000),
  highlight: (lane: LaneId, enabled: boolean) => { try { post(lane, { type: 'retry:highlight', enabled }); } catch { /* frame gone */ } },
  reset: (lane: LaneId, seed: number, versionIndex: number, bugs: BugId[]) => { try { post(lane, { type: 'retry:reset', seed, versionIndex, bugs }); } catch { /* frame gone */ } },
  hasFrame: (lane: LaneId) => frames.has(lane),
  onCursor(lane: LaneId, h: (c: CursorMsg) => void) {
    ensureListener();
    const s = cursorSubs.get(lane) ?? new Set();
    cursorSubs.set(lane, s); s.add(h);
    return () => { s.delete(h); };
  },
  onPick(lane: LaneId, h: (p: Pick) => void) {
    ensureListener();
    const s = pickSubs.get(lane) ?? new Set();
    pickSubs.set(lane, s); s.add(h);
    return () => { s.delete(h); };
  },
};

/** Wait until a lane's iframe answers a snapshot (it may still be loading). */
export async function waitReady(lane: LaneId, tries = 20): Promise<SnapshotRes> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { if (frames.has(lane)) return await request<SnapshotRes>(lane, { type: 'retry:snapshot' }, 1200); } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw last instanceof Error ? last : new Error(`lane ${lane} not ready`);
}

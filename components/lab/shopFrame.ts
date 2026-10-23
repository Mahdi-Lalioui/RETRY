'use client';
// Parent-side client for the shop iframe bridge (plan §28). One instance per <iframe>; filters by event.source.
import type { AgentAction, StepResult } from '@/lib/agent/types';
import type { BugId, ShopState } from '@/lib/shop/state';

export interface SnapshotRes { snapshot: string; ids: string[]; state: ShopState; layoutTag: string }
export interface ActRes { result: StepResult; semKey?: string; state: ShopState; layoutTag: string }
export interface Pick { id: string; semKey: string; role: string; label: string }

type Listener = (m: Record<string, unknown>) => void;

export class ShopFrame {
  private seq = 0;
  private pending = new Map<string, (m: Record<string, unknown>) => void>();
  private listeners = new Set<Listener>();
  private readonly onMsg = (ev: MessageEvent) => {
    if (ev.origin !== window.location.origin) return;
    if (!this.iframe.contentWindow || ev.source !== this.iframe.contentWindow) return;
    const m = ev.data as Record<string, unknown> | null;
    if (!m || typeof m.type !== 'string' || !m.type.startsWith('retry:')) return;
    const id = m.reqId as string | undefined;
    if (id && this.pending.has(id)) { this.pending.get(id)!(m); this.pending.delete(id); }
    this.listeners.forEach((l) => l(m));
  };

  constructor(public iframe: HTMLIFrameElement) { window.addEventListener('message', this.onMsg); }
  dispose() { window.removeEventListener('message', this.onMsg); this.pending.clear(); this.listeners.clear(); }
  on(l: Listener): () => void { this.listeners.add(l); return () => { this.listeners.delete(l); }; }

  private send(msg: Record<string, unknown>) { this.iframe.contentWindow?.postMessage(msg, window.location.origin); }
  private req<T>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 15000): Promise<T> {
    const reqId = `r${++this.seq}`;
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(reqId); reject(new Error(`${type} timed out`)); }, timeoutMs);
      this.pending.set(reqId, (m) => { clearTimeout(t); resolve(m as T); });
      this.send({ type, reqId, ...payload });
    });
  }

  snapshot() { return this.req<SnapshotRes>('retry:snapshot'); }
  act(action: AgentAction) { return this.req<ActRes>('retry:act', { action }); }
  apply(semKey: string, value?: string) { return this.req<{ result: 'ok' | 'no_effect'; state: ShopState }>('retry:apply', { semKey, value }); }
  highlight(enabled: boolean) { this.send({ type: 'retry:highlight', enabled }); }
  reset(seed: number, versionIndex: number, bugs: BugId[]): Promise<{ state: ShopState; layoutTag: string }> {
    return new Promise((resolve) => {
      const off = this.on((m) => { if (m.type === 'retry:ready') { off(); resolve(m as never); } });
      this.send({ type: 'retry:reset', seed, versionIndex, bugs });
    });
  }
  /** Reset, retrying until the bridge inside the iframe is installed and answers. */
  async boot(seed: number, versionIndex: number, bugs: BugId[], tries = 50): Promise<{ state: ShopState; layoutTag: string }> {
    for (let i = 0; i < tries; i++) {
      const r = await Promise.race([this.reset(seed, versionIndex, bugs), new Promise<null>((x) => setTimeout(() => x(null), 400))]);
      if (r) return r;
    }
    throw new Error('shop bridge did not answer');
  }
  /** Resolves on the next retry:ready (initial mount). */
  ready(timeoutMs = 20000): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { off(); reject(new Error('shop not ready')); }, timeoutMs);
      const off = this.on((m) => { if (m.type === 'retry:ready') { clearTimeout(t); off(); resolve(); } });
    });
  }
}

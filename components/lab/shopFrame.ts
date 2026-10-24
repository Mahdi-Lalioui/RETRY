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
  private pending = new Map<string, { resolve: (m: Record<string, unknown>) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private listeners = new Set<Listener>();
  private disposed = false;
  private readonly onMsg = (ev: MessageEvent) => {
    if (ev.origin !== window.location.origin) return;
    if (!this.iframe.contentWindow || ev.source !== this.iframe.contentWindow) return;
    const m = ev.data as Record<string, unknown> | null;
    if (!m || typeof m.type !== 'string' || !m.type.startsWith('retry:')) return;
    const id = m.reqId as string | undefined;
    if (id && this.pending.has(id)) { const p = this.pending.get(id)!; clearTimeout(p.timer); p.resolve(m); this.pending.delete(id); }
    this.listeners.forEach((l) => l(m));
  };

  constructor(public iframe: HTMLIFrameElement) { window.addEventListener('message', this.onMsg); }
  dispose() {
    if (this.disposed) return;
    this.cancel(); this.disposed = true;
    window.removeEventListener('message', this.onMsg);
    this.listeners.clear();
  }
  on(l: Listener): () => void { this.listeners.add(l); return () => { this.listeners.delete(l); }; }

  private send(msg: Record<string, unknown>) { this.iframe.contentWindow?.postMessage(msg, window.location.origin); }
  private req<T>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 15000): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('shop frame disposed'));
    const reqId = `r${++this.seq}`;
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(reqId); reject(new Error(`${type} timed out`)); }, timeoutMs);
      this.pending.set(reqId, { timer: t, resolve: (m) => resolve(m as T), reject });
      this.send({ type, reqId, ...payload });
    });
  }

  snapshot() { return this.req<SnapshotRes>('retry:snapshot'); }
  act(action: AgentAction) { return this.req<ActRes>('retry:act', { action }); }
  apply(semKey: string, value?: string) { return this.req<{ result: 'ok' | 'no_effect'; state: ShopState }>('retry:apply', { semKey, value }); }
  highlight(enabled: boolean) { this.send({ type: 'retry:highlight', enabled }); }
  cancel() {
    this.send({ type: 'retry:cancel' });
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('shop request cancelled')); }
    this.pending.clear();
  }
  reset(seed: number, versionIndex: number, bugs: BugId[], taskId?: string, timeoutMs = 4000): Promise<{ state: ShopState; layoutTag: string }> {
    return this.req('retry:reset', { seed, versionIndex, bugs, taskId }, timeoutMs);
  }
  /** Reset, retrying until the bridge inside the iframe is installed and answers. */
  async boot(seed: number, versionIndex: number, bugs: BugId[], taskId?: string, signal?: AbortSignal, tries = 50): Promise<{ state: ShopState; layoutTag: string }> {
    for (let i = 0; i < tries; i++) {
      if (this.disposed || signal?.aborted) throw new Error('shop boot cancelled');
      try { return await this.reset(seed, versionIndex, bugs, taskId, 400); }
      catch (e) { if (this.disposed || signal?.aborted) throw e; }
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

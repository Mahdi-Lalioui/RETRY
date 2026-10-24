'use client';
/**
 * Bridge + executor that runs INSIDE the shop iframe (plan.md §9.7, protocol in §28).
 * Client-only. All messages are same-origin (`event.origin === location.origin`).
 *
 * Parent → iframe
 *   {type:'retry:snapshot', reqId}
 *       → {type:'retry:snapshot:res', reqId, snapshot, ids, state, layoutTag}
 *         ids = element ids currently in the snapshot (e1..eN)
 *   {type:'retry:act', reqId, action: AgentAction}
 *       → while animating: {type:'retry:cursor', x, y, pressed?}  (CSS px in the unscaled 1280×800 shop viewport)
 *       → {type:'retry:act:res', reqId, result: StepResult, state, layoutTag, semKey?}
 *   {type:'retry:highlight', enabled}
 *       → rescue-hover mode: elements get an amber outline + chip "e3 · button · Not now".
 *         A human click is NOT applied; instead: {type:'retry:pick', id, semKey, role, label}
 *   {type:'retry:apply', reqId, semKey, value?}        (apply a human-chosen action)
 *       → {type:'retry:apply:res', reqId, result, state, layoutTag}
 *   {type:'retry:reset', seed, versionIndex, bugs, taskId?}     (reload shop state, e.g. "Ship new version" / "Break checkout")
 *       → {type:'retry:ready', layoutTag, state}
 *
 * Iframe → parent (unsolicited)
 *   {type:'retry:ready', layoutTag, state}   once on mount and after every reset
 *   {type:'retry:state', state, layoutTag}   whenever a human interacts with the shop directly
 */
import type { BugId, ShopState } from './state';
import type { AgentAction, StepResult } from '@/lib/agent/types';
import { act, applyAction, elements } from './engine';
import { renderSnapshot } from './snapshot';

export interface BridgeHost {
  getState(): ShopState;
  setState(s: ShopState): void;
  setHighlight(enabled: boolean): void;
  reset(seed: number, versionIndex: number, bugs: BugId[], taskId?: string): ShopState;
  scrollRoot(): HTMLElement | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const frames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

type Msg = { type: string; reqId?: string; [k: string]: unknown };

export function post(msg: Msg): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage(msg, window.location.origin);
}

export function installBridge(host: BridgeHost): () => void {
  let highlight = false;
  let queue: Promise<void> = Promise.resolve();
  let lastCursor = { x: 640, y: 400 };
  let generation = 0;
  let disposed = false;

  const reply = (state: ShopState) => ({ state, layoutTag: state.layout.layoutTag });

  async function moveTo(el: Element, current: () => boolean): Promise<void> {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    await sleep(180);
    if (!current()) return;
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + Math.min(r.width / 2, 60 + r.width / 4));
    const y = Math.round(r.top + r.height / 2);
    lastCursor = { x, y };
    post({ type: 'retry:cursor', x, y });
    await sleep(380);
    if (!current()) return;
    post({ type: 'retry:cursor', x, y, pressed: true });
    await sleep(120);
  }

  async function runAct(reqId: string | undefined, action: AgentAction, mine: number): Promise<void> {
    const current = () => !disposed && mine === generation;
    if (!current()) { if (!disposed) post({ type: 'retry:act:res', reqId, result: 'error', ...reply(host.getState()) }); return; }
    let state = host.getState();
    let result: StepResult = 'ok';
    let semKey: string | undefined;
    try {
      if (action.type === 'scroll') {
        host.scrollRoot()?.scrollBy({ top: 400, behavior: 'smooth' });
        await sleep(300);
      } else if (action.type === 'click' || action.type === 'type' || action.type === 'select') {
        const el = action.target ? document.querySelector(`[data-agent-id="${action.target}"]`) : null;
        if (el) await moveTo(el, current);
        if (!current()) return;
        if (el && action.type === 'type' && action.value) {
          const key = elements(state).find((e) => e.id === action.target)?.semKey;
          if (key) {
            for (let i = 1; i < action.value.length; i++) {
              if (!current()) return;
              host.setState(applyAction(state, key, action.value.slice(0, i)).state);
              await sleep(25);
            }
          }
        }
      }
      if (!current()) return;
      const r = act(state, action);
      state = r.state; result = r.result; semKey = r.semKey;
      host.setState(state);
      await frames();
      if (!current()) return;
      post({ type: 'retry:cursor', x: lastCursor.x, y: lastCursor.y, pressed: false });
    } catch {
      result = 'error';
    } finally {
      if (!disposed && !current()) post({ type: 'retry:act:res', reqId, result: 'error', ...reply(host.getState()) });
    }
    if (current()) post({ type: 'retry:act:res', reqId, result, semKey, ...reply(state) });
  }

  function onMessage(ev: MessageEvent): void {
    if (ev.origin !== window.location.origin || ev.source !== window.parent) return;
    const m = ev.data as Msg | null;
    if (!m || typeof m.type !== 'string' || !m.type.startsWith('retry:')) return;
    switch (m.type) {
      case 'retry:snapshot': {
        const s = host.getState();
        post({ type: 'retry:snapshot:res', reqId: m.reqId, snapshot: renderSnapshot(s), ids: elements(s).map((e) => e.id), ...reply(s) });
        break;
      }
      case 'retry:act': {
        const mine = generation;
        queue = queue.then(() => runAct(m.reqId, m.action as AgentAction, mine)).catch(() => { /* a malformed request must not poison the queue */ });
        break;
      }
      case 'retry:cancel':
        generation++; queue = Promise.resolve();
        post({ type: 'retry:cursor', ...lastCursor, pressed: false });
        break;
      case 'retry:highlight':
        highlight = !!m.enabled;
        host.setHighlight(highlight);
        break;
      case 'retry:restore': { // Agent E: roll back to a previous state (rescue happens on the pre-violation page)
        generation++; queue = Promise.resolve();
        const s = m.state as ShopState;
        if (s && s.layout) host.setState(s);
        post({ type: 'retry:apply:res', reqId: m.reqId, result: 'ok', ...reply(host.getState()) });
        break;
      }
      case 'retry:apply': {
        const r = applyAction(host.getState(), String(m.semKey), m.value === undefined ? undefined : String(m.value));
        host.setState(r.state);
        post({ type: 'retry:apply:res', reqId: m.reqId, result: r.effect, ...reply(r.state) });
        break;
      }
      case 'retry:reset': {
        generation++; queue = Promise.resolve();
        const s = host.reset(Number(m.seed), Number(m.versionIndex), (m.bugs as BugId[]) ?? [], typeof m.taskId === 'string' ? m.taskId : undefined);
        post({ type: 'retry:ready', reqId: m.reqId, ...reply(s) });
        break;
      }
    }
  }

  function agentTarget(ev: Event): HTMLElement | null {
    const t = ev.target as HTMLElement | null;
    return t?.closest?.('[data-agent-id]') as HTMLElement | null;
  }
  function onPointer(ev: Event): void {
    if (!highlight) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.type !== 'click') return;
    const el = agentTarget(ev);
    if (!el) return;
    const id = el.dataset.agentId!;
    const info = elements(host.getState()).find((e) => e.id === id);
    if (info) post({ type: 'retry:pick', id, semKey: info.semKey, role: info.role, label: info.label });
  }

  window.addEventListener('message', onMessage);
  document.addEventListener('click', onPointer, true);
  document.addEventListener('mousedown', onPointer, true);
  post({ type: 'retry:ready', ...reply(host.getState()) });
  return () => {
    disposed = true; generation++;
    window.removeEventListener('message', onMessage);
    document.removeEventListener('click', onPointer, true);
    document.removeEventListener('mousedown', onPointer, true);
  };
}

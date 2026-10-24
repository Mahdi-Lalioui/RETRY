import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState, findBySemKey } from '@/lib/shop/engine';
import { installBridge } from '@/lib/shop/bridge';
import type { ShopState } from '@/lib/shop/state';

class Surface extends EventTarget {
  location = { origin: 'http://retry.test' };
  parent = { postMessage: vi.fn() };
}

let surface: Surface;
let dispose: () => void;
let state: ShopState;
function send(data: Record<string, unknown>) {
  surface.dispatchEvent(Object.assign(new Event('message'), { data, origin: surface.location.origin, source: surface.parent }));
}

beforeEach(() => {
  vi.useFakeTimers();
  surface = new Surface();
  const document = Object.assign(new EventTarget(), { querySelector: () => ({ scrollIntoView() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 40 }) }) });
  vi.stubGlobal('window', surface);
  vi.stubGlobal('document', document);
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0));
  state = { ...initialState(1, 1), openModals: ['cookies'] };
  dispose = installBridge({ getState: () => state, setState: (s) => { state = s; }, setHighlight() {},
    reset: (seed, version, bugs) => { state = initialState(seed, version, bugs); return state; }, scrollRoot: () => null });
});
afterEach(() => { dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('shop bridge cancellation', () => {
  it('does not overwrite a reset with an action whose cursor animation is still running', async () => {
    const target = findBySemKey(state, 'cookies.essential')!;
    send({ type: 'retry:act', reqId: 'old', action: { type: 'click', target, reason: 'reject cookies' } });
    await vi.advanceTimersByTimeAsync(200);
    send({ type: 'retry:reset', seed: 999, versionIndex: 4, bugs: [] });
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.layout.seed).toBe(999);
    expect(state.cookiesChoice).toBeUndefined();
  });

  it('Stop cancels queued and animating actions without clearing current shop state', async () => {
    send({ type: 'retry:act', reqId: 'old', action: { type: 'click', target: findBySemKey(state, 'cookies.essential'), reason: 'reject cookies' } });
    await vi.advanceTimersByTimeAsync(200);
    send({ type: 'retry:cancel' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.cookiesChoice).toBeUndefined();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let surface: EventTarget & { location: { origin: string } };
let source: { postMessage: (m: Record<string, unknown>) => void };
let posted: Record<string, unknown>[];
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers();
  surface = Object.assign(new EventTarget(), { location: { origin: 'http://retry.test' } });
  vi.stubGlobal('window', surface);
  posted = [];
  source = { postMessage: (m) => { posted.push(m); } };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('mission iframe requests', () => {
  it('ignores a same-origin reply from a different iframe', async () => {
    const { registerFrame, bridge } = await import('@/lib/store/frames');
    registerFrame('base', { contentWindow: source } as unknown as HTMLIFrameElement);
    let result: string | undefined;
    const req = bridge.snapshot('base').then((s) => { result = s.snapshot; });
    const reqId = posted[0].reqId;
    surface.dispatchEvent(Object.assign(new Event('message'), { origin: surface.location.origin, source: {}, data: { type: 'retry:snapshot:res', reqId, snapshot: 'wrong lane' } }));
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBeUndefined();
    surface.dispatchEvent(Object.assign(new Event('message'), { origin: surface.location.origin, source, data: { type: 'retry:snapshot:res', reqId, snapshot: 'right lane' } }));
    await req;
    expect(result).toBe('right lane');
  });

  it('releases a pending request as soon as its lane is cancelled', async () => {
    const { registerFrame, bridge } = await import('@/lib/store/frames');
    registerFrame('base', { contentWindow: source } as unknown as HTMLIFrameElement);
    const request = bridge.snapshot('base').then(() => 'resolved', () => 'cancelled');
    bridge.cancel('base');
    await vi.advanceTimersByTimeAsync(1);
    expect(await Promise.race([request, Promise.resolve('pending')])).toBe('cancelled');
  });
});

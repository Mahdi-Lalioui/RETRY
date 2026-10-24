import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopFrame } from '@/components/lab/shopFrame';

let surface: EventTarget & { location: { origin: string } };
let client: ShopFrame;
let posted: Record<string, unknown>[];
let source: { postMessage: (m: Record<string, unknown>) => void };
beforeEach(() => {
  vi.useFakeTimers();
  surface = Object.assign(new EventTarget(), { location: { origin: 'http://retry.test' } });
  vi.stubGlobal('window', surface);
  posted = [];
  source = { postMessage: (m) => { posted.push(m); } };
  client = new ShopFrame({ contentWindow: source } as unknown as HTMLIFrameElement);
});
afterEach(() => { client.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('lab iframe lifecycle', () => {
  it('boots each training task with its own collection requirement', async () => {
    const boot = client.reset(2, 1, [], 'T11');
    const reset = posted[0];
    surface.dispatchEvent(Object.assign(new Event('message'), { origin: surface.location.origin, source, data: { type: 'retry:ready', reqId: reset.reqId, state: {}, layoutTag: 'layout-v1' } }));
    await boot;
    expect(reset.taskId).toBe('T11');
  });

  it('releases an outstanding snapshot immediately when the viewport is disposed', async () => {
    const snapshot = client.snapshot();
    const settled = snapshot.then(() => 'resolved', () => 'rejected');
    client.dispose();
    await vi.advanceTimersByTimeAsync(1);
    expect(await Promise.race([settled, Promise.resolve('still pending')])).toBe('rejected');
  });
});

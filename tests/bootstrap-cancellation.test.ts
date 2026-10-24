import { afterEach, expect, it, vi } from 'vitest';
import { boot, runAll, stopAll } from '@/lib/agent/loop';
import { useMission } from '@/lib/store/mission';
import { initialState } from '@/lib/shop/engine';
import type { StepResponse, Verdict } from '@/lib/agent/types';

const frames = vi.hoisted(() => ({
  reset: vi.fn(), cancel: vi.fn(), highlight: vi.fn(), waitReady: vi.fn(), snapshot: vi.fn(),
}));
vi.mock('@/lib/store/frames', () => ({ bridge: frames, waitReady: frames.waitReady }));

const response = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { headers: { 'content-type': 'application/json' } });
afterEach(() => { stopAll(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('keeps a run cancelled during bootstrap stopped, while allowing a later explicit Run', async () => {
  vi.useFakeTimers();
  let release!: (res: Response) => void;
  const pendingBootstrap = new Promise<Response>((resolve) => { release = resolve; });
  const state = initialState(9001, 4);
  const snapshot = { snapshot: 'PAGE home', ids: [], state, layoutTag: state.layout.layoutTag };
  const done: StepResponse = { stepId: 'step', action: { type: 'done', reason: 'done' }, callId: null, latencyMs: 1, usage: { in: 1, out: 1 }, costUsd: null, raw: '{}', parseOk: true, promptChars: 1 };
  const passed: Verdict = { status: 'passed', correct: true, reason: 'verified', violations: [] };
  frames.waitReady.mockResolvedValue(snapshot);
  frames.snapshot.mockResolvedValue(snapshot);
  const fetch = vi.fn(async (path: string) => {
    if (path === '/api/demo/bootstrap') return pendingBootstrap;
    if (path === '/api/health') return response({ mubit: 'mock', db: 'ok', demoMode: false });
    if (path === '/api/versions' || path.startsWith('/api/corrections?')) return response([]);
    if (path === '/api/agent/step') return response(done);
    if (path === '/api/agent/finish') return response(passed);
    return response({ rows: [], curve: [] });
  });
  vi.stubGlobal('fetch', fetch);

  const booting = boot();
  const cancelledRun = runAll();
  stopAll();
  release(response({}));
  await booting;
  await vi.advanceTimersByTimeAsync(250);
  await cancelledRun;

  expect(frames.reset).not.toHaveBeenCalled();
  expect(frames.waitReady).not.toHaveBeenCalled();
  expect(fetch.mock.calls.some(([path]) => path === '/api/agent/step')).toBe(false);
  expect(useMission.getState().running).toBe(false);
  expect(useMission.getState().calls).toBe(0);

  const freshRun = runAll();
  await vi.advanceTimersByTimeAsync(250);
  await freshRun;
  expect(useMission.getState().lanes.closed.verdict?.correct).toBe(true);
  expect(useMission.getState().calls).toBeGreaterThan(0);
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepResponse, Verdict } from '@/lib/agent/types';
import { initialState } from '@/lib/shop/engine';
import { useMission } from '@/lib/store/mission';
import { resolveRescue, runAll, stopAll, trainNow, toggleDemo } from '@/lib/agent/loop';
import { startReplay, stopReplay } from '@/lib/agent/demo-driver';
import type { Recording } from '@/lib/demo/types';

const frame = vi.hoisted(() => ({
  snapshot: vi.fn(), act: vi.fn(), apply: vi.fn(), restore: vi.fn(),
  reset: vi.fn(), highlight: vi.fn(), cancel: vi.fn(), waitReady: vi.fn(),
}));
vi.mock('@/lib/store/frames', () => ({ bridge: frame, waitReady: frame.waitReady }));

const original = useMission.getState();
const state = initialState(9001, 4);
const snap = { snapshot: 'PAGE home', ids: [], state, layoutTag: state.layout.layoutTag };
const done: StepResponse = { stepId: 'step', action: { type: 'done', reason: 'done' }, callId: null, latencyMs: 1, usage: { in: 1, out: 1 }, costUsd: null, raw: '{}', parseOk: true, promptChars: 1 };
const passed: Verdict = { status: 'passed', correct: true, reason: 'current run', violations: [] };
const response = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  useMission.setState(original, true);
  frame.waitReady.mockResolvedValue(snap);
  frame.snapshot.mockResolvedValue(snap);
  frame.act.mockResolvedValue({ ...snap, result: 'ok' });
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    if (path === '/api/agent/step') return response(done);
    if (path === '/api/agent/finish') return response(passed);
    return response({ rows: [], curve: [] });
  }));
});

afterEach(() => { stopAll(); stopReplay(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('mission run cancellation', () => {
  it('does not launch lanes after Stop during startup', async () => {
    const running = runAll();
    stopAll();
    await vi.advanceTimersByTimeAsync(250);
    await running;
    expect(useMission.getState().lanes.closed.steps).toEqual([]);
    expect(useMission.getState().lanes.closed.status).toBe('idle');
    expect(useMission.getState().calls).toBe(0);
    expect(useMission.getState().running).toBe(false);
  });

  it('ignores a finish response from a run stopped before a new run', async () => {
    let release!: (r: Response) => void;
    const stale = new Promise<Response>((r) => { release = r; });
    let finishing = 0;
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path === '/api/agent/step') return response(done);
      if (path === '/api/agent/finish') return ++finishing <= 3 ? stale : response(passed);
      return response({ rows: [], curve: [] });
    }));
    const first = runAll();
    await vi.advanceTimersByTimeAsync(250);
    const second = runAll();
    await vi.advanceTimersByTimeAsync(250);
    await second;
    release(response({ ...passed, correct: false, reason: 'stale run' }));
    await first;
    expect(useMission.getState().lanes.closed.verdict?.reason).toBe('current run');
  });

  it('turns a rejected refresh into a retryable visible error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'provider offline' }), { status: 503 })));
    const training = trainNow();
    await vi.advanceTimersByTimeAsync(1);
    expect(useMission.getState().training.phase).toBe('held_back');
    expect(useMission.getState().training.reason).toContain('provider offline');
    await training;
  });

  it('does not call a run verified when the oracle request failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (path: string) => path === '/api/agent/step' ? response(done) : path === '/api/agent/finish' ? new Response(JSON.stringify({ ok: false, error: 'oracle unavailable' }), { status: 503 }) : response({ rows: [], curve: [] })));
    const running = runAll();
    await vi.advanceTimersByTimeAsync(250);
    await running;
    expect(useMission.getState().lanes.closed.verdict?.correct).toBe(false);
    expect(useMission.getState().lanes.closed.verdict?.status).toBe('failed');
    expect(useMission.getState().lanes.closed.verdict?.reason).toContain('verification unavailable');
  });

  it('keeps a correction queued until delivery is known and shows a rejected background delivery', async () => {
    let baseSteps = 0;
    frame.act.mockResolvedValue({ ...snap, state: { ...state, violations: ['R5'] }, result: 'ok' });
    frame.restore.mockResolvedValue(snap);
    frame.apply.mockResolvedValue({ ...snap, result: 'ok' });
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/agent/step') {
        const body = JSON.parse(String(init?.body));
        return response(body.lane === 'base' && baseSteps++ === 0 ? { ...done, action: { type: 'click', target: 'e2', reason: 'accept cookies' } } : done);
      }
      if (path === '/api/corrections') return response({ correctionId: 'cor-rejected', augmented: 8 });
      if (path.startsWith('/api/corrections?')) return response([{ id: 'cor-rejected', status: 'failed', source: 'human' }]);
      if (path === '/api/agent/finish') return response(passed);
      return response({ rows: [], curve: [] });
    }));
    const running = runAll();
    await vi.advanceTimersByTimeAsync(250);
    expect(useMission.getState().rescue?.lane).toBe('base');
    resolveRescue('base', { pick: { id: 'e3', semKey: 'cookies.essential', role: 'button', label: 'Essential only' }, rule: 'R5' });
    await vi.advanceTimersByTimeAsync(1);
    expect(useMission.getState().corrections[0]?.status).toBe('queued');
    await vi.advanceTimersByTimeAsync(1000);
    await running;
    expect(useMission.getState().corrections[0]?.status).toBe('failed');
  });

  it('does not label a queued correction trained merely because another version was promoted', async () => {
    useMission.getState().set({ corrections: [{ id: 'local', serverId: 'cor-later', lane: 'base', bad: { action: done.action }, good: { action: done.action }, augmented: 8, status: 'queued', landed: true, at: Date.now() }] });
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path === '/api/refresh') return response({ jobId: 'job' });
      if (path.startsWith('/api/refresh/status')) return response({ phase: 'promoted', version: { id: 'v5', label: 'v5', promoted: true } });
      if (path.startsWith('/api/corrections?')) return response([{ id: 'cor-later', status: 'queued' }]);
      return response({ rows: [], curve: [] });
    }));
    const training = trainNow();
    await vi.advanceTimersByTimeAsync(1000);
    await training;
    expect(useMission.getState().adapted.label).toBe('v5');
    expect(useMission.getState().corrections[0]?.status).toBe('queued');
  });
});

describe('replay isolation', () => {
  const rec: Recording = {
    format: 'retry-recording@1', id: 'test', title: 'Replay fixture', recordedAt: '2026-10-24T09:00:00Z',
    source: 'simulator', mubitMode: 'mock', timing: 'simulated', honestLabel: 'Replay · mock model', durationMs: 1000,
    events: [
      { kind: 'version', at: 0, phase: 'promoted', label: 'v99', progress: 1, examples: 900 },
      { kind: 'correction', at: 0, sceneId: 'test', lane: 'base', rule: 'R1', source: 'scripted', badAction: null, goodAction: { type: 'click', target: 'e2', reason: 'decline' }, augmented: 8 },
    ],
  };

  it('keeps scripted provenance and restores the live version when leaving replay', async () => {
    useMission.getState().set({ mode: 'replay', adapted: { label: 'v4', versionId: 'real-v4', examples: 40 } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(rec))));
    await startReplay();
    await vi.advanceTimersByTimeAsync(1);
    expect(useMission.getState().corrections[0]?.source).toBe('scripted');
    toggleDemo();
    expect(useMission.getState().mode).toBe('live');
    expect(useMission.getState().adapted).toEqual({ label: 'v4', versionId: 'real-v4', examples: 40 });
    expect(useMission.getState().training.phase).toBe('collecting');
  });

  it('stops replay events before starting a live run', async () => {
    useMission.getState().set({ mode: 'replay', adapted: { label: 'v4', versionId: 'real-v4' } });
    vi.stubGlobal('fetch', vi.fn(async (path: string) => path.startsWith('/demo/') ? new Response(JSON.stringify(rec)) : path === '/api/agent/step' ? response(done) : path === '/api/agent/finish' ? response(passed) : response({ rows: [], curve: [] })));
    await startReplay();
    const running = runAll();
    await vi.advanceTimersByTimeAsync(1500);
    await running;
    expect(useMission.getState().mode).toBe('live');
    expect(useMission.getState().adapted.label).toBe('v4');
    expect(useMission.getState().corrections).toEqual([]);
    expect(useMission.getState().lanes.closed.verdict?.correct).toBe(true);
  });

  it('restores a real training result that arrived while replay was showing its own version', async () => {
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path.startsWith('/demo/')) return new Response(JSON.stringify({ ...rec, durationMs: 10000 }));
      if (path === '/api/refresh') return response({ jobId: 'job' });
      if (path.startsWith('/api/refresh/status')) return response({ phase: 'promoted', version: { id: 'real-v5', label: 'v5', promoted: true, examples: 80, status: 'ready' } });
      return response({ rows: [], curve: [] });
    }));
    const training = trainNow();
    await vi.advanceTimersByTimeAsync(1);
    useMission.getState().set({ mode: 'replay' });
    await startReplay();
    await vi.advanceTimersByTimeAsync(1000);
    await training;
    expect(useMission.getState().adapted.label).toBe('v99');
    toggleDemo();
    expect(useMission.getState().adapted).toMatchObject({ label: 'v5', versionId: 'real-v5', examples: 80 });
  });
});

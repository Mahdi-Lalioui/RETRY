// plan §19 — recorder. Works in the browser (Mission Control Shift+R, clock = performance.now) and in scripts
// (scripts/record-demo.ts with a virtual clock advanced by simulated latencies).
import type { Recording, RecordingEvent } from './types';

type Distribute<T> = T extends { at: number } ? Omit<T, 'at'> & { at?: number } : never;
export type EventInput = Distribute<RecordingEvent>;

export interface RecorderOpts {
  title: string; source: Recording['source']; mubitMode: Recording['mubitMode']; timing: Recording['timing'];
  /** Custom clock (ms). Default: real time since start. */
  now?: () => number;
}

export interface Recorder {
  /** Record an event at the clock's current time (or an explicit `at`). */
  add(e: EventInput): RecordingEvent;
  /** Virtual clocks only: move time forward. */
  advance(ms: number): void;
  now(): number;
  finish(): Recording;
}

function fmtWhen(d: Date): string {
  return d.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}

export function createRecorder(o: RecorderOpts): Recorder {
  const started = new Date();
  const t0 = Date.now();
  let virtual = 0;
  const useVirtual = o.timing === 'simulated' && !o.now;
  const now = o.now ?? (() => (useVirtual ? virtual : Date.now() - t0));
  const events: RecordingEvent[] = [];
  return {
    add(e) {
      const ev = { ...e, at: Math.round(e.at ?? now()) } as RecordingEvent;
      events.push(ev);
      return ev;
    },
    advance(ms) { virtual += Math.max(0, ms); },
    now,
    finish() {
      const sorted = [...events].sort((a, b) => a.at - b.at);
      const durationMs = sorted.length ? sorted[sorted.length - 1].at + 1500 : 0;
      const what = o.source === 'simulator' ? 'simulator run' : 'live run';
      return {
        format: 'retry-recording@1', id: `rec_${started.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`, title: o.title,
        recordedAt: started.toISOString(), source: o.source, mubitMode: o.mubitMode, timing: o.timing,
        honestLabel: `Replay of ${what} recorded ${fmtWhen(started)} · ${o.timing === 'real' ? 'real timings' : 'simulated timings'}${o.mubitMode === 'mock' ? ' · mock model' : ''}`,
        durationMs, events: sorted,
      };
    },
  };
}

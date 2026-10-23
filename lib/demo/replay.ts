// plan §19 — replay engine. Schedules a Recording's events on a clock and hands each to `onEvent`.
// The consumer (Mission Control loop, /attract) applies them: 'scene' → retry:reset on each lane iframe,
// 'step' → retry:act with the recorded action (the shop engine is deterministic, so the same state results),
// 'verdict' → stamp, 'correction' → card animation, 'version' → training ring / badge flip.
import type { Recording, RecordingEvent } from './types';

export interface ReplayOpts {
  onEvent: (e: RecordingEvent, r: Recording) => void;
  onEnd?: () => void;
  speed?: number;       // 1 = recorded timings
  loop?: boolean;
  /** Injectable timers (tests). */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  now?: () => number;
}

export interface Replay {
  play(): void; pause(): void; stop(): void;
  /** ms into the recording */
  position(): number;
  readonly playing: boolean;
}

export function createReplay(rec: Recording, o: ReplayOpts): Replay {
  const setT = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const now = o.now ?? (() => Date.now());
  const speed = Math.max(0.05, o.speed ?? 1);
  let idx = 0; let pos = 0; let startedAt = 0; let timer: unknown = null; let playing = false;

  const schedule = () => {
    if (!playing) return;
    if (idx >= rec.events.length) {
      const tail = Math.max(0, (rec.durationMs - pos) / speed);
      timer = setT(() => {
        if (o.loop) { idx = 0; pos = 0; startedAt = now(); schedule(); } else { playing = false; o.onEnd?.(); }
      }, tail);
      return;
    }
    const ev = rec.events[idx];
    const wait = Math.max(0, (ev.at - pos) / speed);
    timer = setT(() => {
      pos = ev.at; startedAt = now() - pos / speed; idx++;
      try { o.onEvent(ev, rec); } catch (e) { console.error('[replay]', e); }
      schedule();
    }, wait);
  };

  return {
    play() { if (playing) return; playing = true; startedAt = now() - pos / speed; schedule(); },
    pause() { if (!playing) return; playing = false; if (timer) clearT(timer); pos = Math.min(rec.durationMs, (now() - startedAt) * speed); },
    stop() { playing = false; if (timer) clearT(timer); idx = 0; pos = 0; },
    position() { return playing ? (now() - startedAt) * speed : pos; },
    get playing() { return playing; },
  };
}

/** Events of one kind (typed). */
export function eventsOf<K extends RecordingEvent['kind']>(rec: Recording, kind: K): Extract<RecordingEvent, { kind: K }>[] {
  return rec.events.filter((e): e is Extract<RecordingEvent, { kind: K }> => e.kind === kind);
}

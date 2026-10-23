// plan §19 / §29 — public entry for DEMO_MODE. Client-safe (fetches /public/demo/*.json).
import type { Recording } from './types';

export type { Recording, RecordingEvent, RecordingEventKind, RefreshPhaseRec } from './types';
export { createReplay, eventsOf, type Replay, type ReplayOpts } from './replay';
export { createRecorder, type Recorder, type RecorderOpts } from './recorder';

const cache = new Map<string, Promise<Recording>>();

export function isRecording(x: unknown): x is Recording {
  const r = x as Recording;
  return !!r && r.format === 'retry-recording@1' && Array.isArray(r.events);
}

/** Load a recorded session from /demo/<name>.json (default: session-default). */
export function loadRecording(name = 'session-default', base = ''): Promise<Recording> {
  const key = `${base}|${name}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`${base}/demo/${name}.json`, { cache: 'force-cache' }).then(async (r) => {
      if (!r.ok) throw new Error(`recording ${name} not found (${r.status})`);
      const j = await r.json();
      if (!isRecording(j)) throw new Error(`invalid recording ${name}`);
      return j;
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

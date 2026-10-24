// plan §27 — getMubit(): real client when MUBIT_ENABLED=true and MUBIT_BASE_URL set, else mock.
import type { MubitClient } from './types';
import { cfg } from './config';
import { createRealClient } from './client';
import { createMockClient, inMockFast } from './mock';

export type { MubitClient } from './types';

export function mubitMode(): 'real' | 'mock' {
  const c = cfg();
  return c.enabled && c.baseUrl ? 'real' : 'mock';
}

const g = globalThis as unknown as { __mubit?: { mode: 'real' | 'mock'; client: MubitClient } };

export function getMubit(): MubitClient {
  const mode = mubitMode();
  if (!g.__mubit || g.__mubit.mode !== mode) g.__mubit = { mode, client: mode === 'real' ? createRealClient() : createMockClient() };
  return g.__mubit.client;
}

const gl = globalThis as unknown as { __mubitLive?: MubitClient };

/** Lanes that call real Mubit even while the learning loop runs on the mock (MUBIT_LIVE_LANES=closed,…).
 *  Needs MUBIT_BASE_URL + MUBIT_API_KEY. Empty in full real mode (every lane is real then). */
export function liveLanes(): string[] {
  if (mubitMode() === 'real') return [];
  const c = cfg();
  if (!c.baseUrl || !process.env.MUBIT_API_KEY) return [];
  return (process.env.MUBIT_LIVE_LANES ?? '').split(',').map((x) => x.trim()).filter(Boolean);
}

/** Client for one lane: real for live lanes in hybrid mode, otherwise the global client. */
export function getMubitFor(lane: string): MubitClient {
  if (!inMockFast() && liveLanes().includes(lane)) return (gl.__mubitLive ??= createRealClient());
  return getMubit();
}

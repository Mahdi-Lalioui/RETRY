// plan §27 — getMubit(): real client when MUBIT_ENABLED=true and MUBIT_BASE_URL set, else mock.
import type { MubitClient } from './types';
import { cfg } from './config';
import { createRealClient } from './client';
import { createMockClient } from './mock';

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

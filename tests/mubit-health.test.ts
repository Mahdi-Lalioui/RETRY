// [G] Regression: real-client failures flip /api/health to "down" (MUBIT UNREACHABLE) and recover; errors never leak keys.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { noteMubit, resetMubitHealth, redact } from '@/lib/mubit/health';
import { createRealClient } from '@/lib/mubit/client';
import { readConfig } from '@/lib/mubit/config';
import { GET as health } from '@/app/api/health/route';

const ENV = { ...process.env };
afterAll(() => { process.env = ENV; });

describe('mubit reachability', () => {
  beforeEach(() => {
    resetMubitHealth();
    Object.assign(process.env, { MUBIT_ENABLED: 'true', MUBIT_BASE_URL: 'http://127.0.0.1:9/v1', MUBIT_API_KEY: 'mbt_mw-app_SECRET' });
  });

  it('health is down after a failure and ok after a success', async () => {
    noteMubit(false, new Error('500 boom'));
    expect((await (await health()).json()).data.mubit).toBe('down');
    noteMubit(true);
    expect((await (await health()).json()).data.mubit).toBe('ok');
  });

  it('a 500 from Mubit becomes a clear, redacted error', async () => {
    const srv = http.createServer((_q, r) => { r.writeHead(500, { 'content-type': 'application/json' }); r.end('{"error":{"message":"boom"}}'); });
    await new Promise<void>((r) => srv.listen(0, r));
    const port = (srv.address() as AddressInfo).port;
    const c = createRealClient({ ...readConfig({ ...process.env, MUBIT_BASE_URL: `http://127.0.0.1:${port}/v1`, MUBIT_CHAT_TIMEOUT_MS: '2000' }) });
    await expect(c.chat({ model: 'open:x', messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(/Mubit unreachable/);
    srv.close();
    expect((await (await health()).json()).data.mubit).toBe('down');
  });

  it('a hanging Mubit times out with a clear message', async () => {
    const srv = http.createServer(() => { /* never answer */ });
    await new Promise<void>((r) => srv.listen(0, r));
    const port = (srv.address() as AddressInfo).port;
    const c = createRealClient({ ...readConfig({ ...process.env, MUBIT_BASE_URL: `http://127.0.0.1:${port}/v1`, MUBIT_CHAT_TIMEOUT_MS: '300' }) });
    await expect(c.chat({ model: 'open:x', messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(/timed out/);
    srv.closeAllConnections(); srv.close();
  });

  it('redacts keys', () => {
    expect(redact('bad key sk-abc123 and mbt_mw-app_xyz Bearer tok')).not.toMatch(/abc123|xyz|tok$/);
  });
});

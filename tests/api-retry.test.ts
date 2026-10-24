// [G] Regression: client api() survives a dropped connection (cold instance restart).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from '@/lib/store/api';

afterEach(() => { vi.unstubAllGlobals(); });

describe('api retry', () => {
  it('retries a network error then succeeds', async () => {
    let n = 0;
    vi.stubGlobal('fetch', async () => { n++; if (n === 1) throw new TypeError('Failed to fetch'); return new Response(JSON.stringify({ ok: true, data: 7 })); });
    expect(await api<number>('/x')).toBe(7);
    expect(n).toBe(2);
  });
  it('does not retry a JSON error envelope', async () => {
    let n = 0;
    vi.stubGlobal('fetch', async () => { n++; return new Response(JSON.stringify({ ok: false, error: 'bad' }), { status: 400 }); });
    await expect(api('/x', {})).rejects.toThrow(/bad/);
    expect(n).toBe(1);
  });
});

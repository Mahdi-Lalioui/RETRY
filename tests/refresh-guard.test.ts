// [G] Regression: "T" with zero new corrections must not mint a duplicate version.
import { describe, it, expect } from 'vitest';
import { POST as refresh } from '@/app/api/refresh/route';
import { resetMemoryRepo } from '@/lib/db';

process.env.MOCK_LATENCY_SCALE = '0';
process.env.MUBIT_ENABLED = 'false';
delete process.env.DATABASE_URL;

describe('refresh guard', () => {
  it('skips when nothing is queued', async () => {
    const repo = resetMemoryRepo();
    const before = (await repo.versions.list()).length;
    const r = await (await refresh(new Request('http://t/api/refresh', { method: 'POST', body: '{}' }))).json();
    expect(r.ok).toBe(true);
    expect(r.data.skipped).toMatch(/No new corrections/);
    expect((await repo.versions.list()).length).toBe(before);
  });
});

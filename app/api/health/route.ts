import { repo } from '@/lib/db';
import { mubitMode } from '@/lib/mubit';
import { cfg } from '@/lib/mubit/config';
import { mubitReachability } from '@/lib/mubit/health';
import { ok } from '../_lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET() {
  const c = cfg();
  let db: 'ok' | 'down' = 'ok';
  try { await repo.versions.current(); } catch { db = 'down'; }
  const mode = mubitMode();
  let mubit: 'ok' | 'mock' | 'down' = mode === 'mock' ? 'mock' : 'ok';
  const reach = mubitReachability();
  if (mode === 'real' && (!c.apiKey || reach.down)) mubit = 'down';
  return ok({
    mubit, ...(reach.down ? { lastError: reach.lastError } : {}), db, demoMode: c.demoMode, dbKind: repo.kind,
    config: { // no secrets: only whether each item is configured
      baseUrl: !!c.baseUrl, apiKey: !!c.apiKey, feedbackUrl: !!c.feedbackUrl, refreshUrl: !!c.refreshUrl, versionsUrl: !!c.versionsUrl,
      versionMode: c.versionMode, memoryFallback: c.memoryFallback, openBaseModel: c.openBaseModel, closedModel: c.closedModel,
    },
  });
}

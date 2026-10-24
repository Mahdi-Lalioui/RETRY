import { z } from 'zod';
import { liveScoreboard } from '@/lib/db/queries';
import { ensureBaselines, heldoutBoard } from '@/lib/eval/board';
import { repo } from '@/lib/db';
import { errorResponse, ok, parseQuery } from '../_lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = parseQuery(req, z.object({ scope: z.enum(['heldout', 'live']).default('live') }));
  if ('res' in q) return q.res;
  try {
    const current = await repo.versions.current();
    const corrections = await repo.corrections.list();
    const totals = {
      rescues: corrections.filter((c) => c.source === 'human').length, examples: corrections.length,
      sinceCurrent: corrections.filter((c) => !c.versionId).length, currentVersion: current?.label ?? 'v1',
    };
    if (q.data.scope === 'live') return ok({ scope: 'live' as const, rows: await liveScoreboard(), curve: [], totals });
    // Agent D: baselines (GPT + Base v1) are evaluated lazily so the held-out scoreboard is never empty.
    await ensureBaselines();
    const h = await heldoutBoard();
    return ok({ scope: 'heldout' as const, rows: h.rows, curve: h.curve, icl: h.icl, totals });
  } catch (e) { return errorResponse(e); }
}

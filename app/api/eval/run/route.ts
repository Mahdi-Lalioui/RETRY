// OWNED BY AGENT D — POST {versionId?|lane?, suite} → {evalId, total}. Progress via GET /api/eval/status (each poll advances a chunk).
import { z } from 'zod';
import { findVersion } from '@/lib/db/queries';
import { startEval, type EvalConfig } from '@/lib/eval/runner';
import { errorResponse, fail, ok, parseJson } from '../../_lib/http';
import { LaneIdS } from '../../_lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;

const S = z.object({ versionId: z.string().optional(), lane: LaneIdS.optional(), suite: z.enum(['heldout', 'smoke']).default('heldout') });

export async function POST(req: Request) {
  const p = await parseJson(req, S);
  if ('res' in p) return p.res;
  try {
    let versionId: string | null = null; let label: string | undefined; let examples: number | undefined;
    if (p.data.versionId) {
      const v = await findVersion(p.data.versionId);
      if (!v) return fail(`unknown version ${p.data.versionId}`, 404);
      versionId = v.id; label = v.label; examples = v.examples ?? 0;
    }
    const lane = p.data.lane ?? (versionId ? ((examples ?? 0) === 0 ? 'base' : 'adapted') : 'base');
    const config: EvalConfig = { lane, versionId, suite: p.data.suite, label, examples };
    const ev = await startEval(config);
    return ok({ evalId: ev.id, total: ev.total });
  } catch (e) { return errorResponse(e); }
}

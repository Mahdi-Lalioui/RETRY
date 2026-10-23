// OWNED BY AGENT D — minimal working stub by Agent B (chunked held-out eval; each GET /api/eval/status advances one chunk — avoids double-processing).
import { z } from 'zod';
import { repo } from '@/lib/db';
import { errorResponse, ok, parseJson } from '../../_lib/http';
import { LaneIdS } from '../../_lib/schemas';
import { suiteItems, type EvalConfig } from '../../_lib/eval-lite';

export const runtime = 'nodejs';
export const maxDuration = 60;

const S = z.object({ versionId: z.string().optional(), lane: LaneIdS.optional(), suite: z.enum(['heldout', 'smoke']).default('heldout') });

export async function POST(req: Request) {
  const p = await parseJson(req, S);
  if ('res' in p) return p.res;
  try {
    const lane = p.data.lane ?? (p.data.versionId ? 'adapted' : 'base');
    const config: EvalConfig = { lane, versionId: p.data.versionId ?? null, suite: p.data.suite };
    const ev = await repo.evals.insert({ versionId: config.versionId, lane, total: suiteItems(config.suite).length, done: 0, metrics: { config } });
    return ok({ evalId: ev.id });
  } catch (e) { return errorResponse(e); }
}

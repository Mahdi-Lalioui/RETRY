// OWNED BY AGENT D — GET ?evalId → {done, total, finished, partialMetrics}. Each poll advances one chunk (whole suite on mock).
import { z } from 'zod';
import { repo } from '@/lib/db';
import { advanceEval, finalMetrics, isFinished } from '@/lib/eval/runner';
import { errorResponse, fail, ok, parseQuery } from '../../_lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = parseQuery(req, z.object({ evalId: z.string().min(1) }));
  if ('res' in q) return q.res;
  try {
    let ev = await repo.evals.get(q.data.evalId);
    if (!ev) return fail('unknown evalId', 404);
    if (!isFinished(ev)) ev = await advanceEval(ev);
    const m = (ev.metrics ?? {}) as Record<string, unknown>;
    const done = ev.done ?? 0, total = ev.total ?? 0;
    const finished = isFinished(ev);
    return ok({ evalId: ev.id, lane: ev.lane, versionId: ev.versionId, done, total, finished, partialMetrics: finished ? finalMetrics(ev) : (m.partial ?? null) });
  } catch (e) { return errorResponse(e); }
}

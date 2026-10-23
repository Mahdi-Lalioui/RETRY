// OWNED BY AGENT D — minimal working stub by Agent B. Each poll advances one chunk (8 runs).
import { z } from 'zod';
import { repo } from '@/lib/db';
import { errorResponse, fail, ok, parseQuery } from '../../_lib/http';
import { advanceEval } from '../../_lib/eval-lite';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = parseQuery(req, z.object({ evalId: z.string().min(1) }));
  if ('res' in q) return q.res;
  try {
    let ev = await repo.evals.get(q.data.evalId);
    if (!ev) return fail('unknown evalId', 404);
    if ((ev.done ?? 0) < (ev.total ?? 0)) ev = await advanceEval(ev);
    const m = (ev.metrics ?? {}) as Record<string, unknown>;
    const done = ev.done ?? 0, total = ev.total ?? 0;
    return ok({ done, total, finished: done >= total, partialMetrics: done >= total ? m : (m.partial ?? null) });
  } catch (e) { return errorResponse(e); }
}

// OWNED BY AGENT D — GET /api/lab/run?runId → run + its steps (for the held-out matrix step replay).
import { z } from 'zod';
import { repo } from '@/lib/db';
import { errorResponse, fail, ok, parseQuery } from '../../_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = parseQuery(req, z.object({ runId: z.string().min(1) }));
  if ('res' in q) return q.res;
  try {
    const run = await repo.runs.get(q.data.runId);
    if (!run) return fail('unknown run', 404);
    const steps = (await repo.steps.list({ runId: run.id })).map((s) => ({
      idx: s.idx, snapshot: s.snapshot, action: s.action, result: s.result, latencyMs: s.latencyMs, promptChars: s.promptChars, raw: s.raw,
    }));
    return ok({ run, steps });
  } catch (e) { return errorResponse(e); }
}

import { z } from 'zod';
import { errorResponse, ok, parseQuery } from '../../_lib/http';
import { refreshStatus } from '../../_lib/refresh';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = parseQuery(req, z.object({ jobId: z.string().optional() }));
  if ('res' in q) return q.res;
  try { return ok(await refreshStatus(q.data.jobId ?? null)); } catch (e) { return errorResponse(e); }
}

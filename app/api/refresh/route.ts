import { z } from 'zod';
import { errorResponse, ok, parseJson } from '../_lib/http';
import { startRefresh } from '../_lib/refresh';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const p = await parseJson(req, z.object({}).passthrough());
  if ('res' in p) return p.res;
  try { return ok(await startRefresh()); } catch (e) { return errorResponse(e); }
}

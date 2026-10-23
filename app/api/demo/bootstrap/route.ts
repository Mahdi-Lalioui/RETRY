// OWNED BY AGENT D — POST (or GET) /api/demo/bootstrap → BootstrapSummary. Idempotent; cached per server instance.
import { ensureBootstrap } from '@/lib/train/bootstrap';
import { errorResponse, ok } from '../../_lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST() {
  try { return ok(await ensureBootstrap()); } catch (e) { return errorResponse(e); }
}
export const GET = POST;

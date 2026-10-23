import { repo } from '@/lib/db';
import { errorResponse, ok } from '../_lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** ModelVersion[] (oldest first) from our DB — the source of truth for labels, rules, promotion. */
export async function GET() {
  try { return ok(await repo.versions.list()); } catch (e) { return errorResponse(e); }
}

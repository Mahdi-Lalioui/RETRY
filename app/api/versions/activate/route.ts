import { z } from 'zod';
import { repo } from '@/lib/db';
import { findVersion } from '@/lib/db/queries';
import { errorResponse, fail, ok, parseJson } from '../../_lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Activate the seeded baseline or a version that already passed the held-out gate. */
export async function POST(req: Request) {
  const p = await parseJson(req, z.object({ versionId: z.string().min(1), mubitVersionId: z.string().min(1).optional() }));
  if ('res' in p) return p.res;
  try {
    const v = await findVersion(p.data.versionId);
    if (!v) return fail(`unknown version ${p.data.versionId}`, 404);
    if (v.status !== 'ready') return fail(`version ${v.label} is ${v.status}`, 409);
    const approved = (v.metrics as { gate?: { pass?: boolean } } | null)?.gate?.pass === true;
    if (v.heldBackReason || (v.id !== 'v1' && !approved)) return fail(`version ${v.label} has not passed the held-out promotion gate`, 409);
    if (p.data.mubitVersionId && p.data.mubitVersionId !== v.mubitVersionId) {
      return fail('A different Mubit adapter must be evaluated before it can be activated', 409);
    }
    const promoted = await repo.versions.promote(v.id);
    return ok({ ok: true, version: promoted });
  } catch (e) { return errorResponse(e); }
}

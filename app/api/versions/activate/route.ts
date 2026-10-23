import { z } from 'zod';
import { repo } from '@/lib/db';
import { findVersion } from '@/lib/db/queries';
import { errorResponse, fail, ok, parseJson } from '../../_lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Promote (or roll back to) a version. Optional mubitVersionId sets the manual Mubit id (§11.2 last resort). */
export async function POST(req: Request) {
  const p = await parseJson(req, z.object({ versionId: z.string().min(1), mubitVersionId: z.string().min(1).optional() }));
  if ('res' in p) return p.res;
  try {
    const v = await findVersion(p.data.versionId);
    if (!v) return fail(`unknown version ${p.data.versionId}`, 404);
    if (v.status !== 'ready') return fail(`version ${v.label} is ${v.status}`, 409);
    if (p.data.mubitVersionId) await repo.versions.update(v.id, { mubitVersionId: p.data.mubitVersionId });
    const promoted = await repo.versions.promote(v.id);
    return ok({ ok: true, version: promoted });
  } catch (e) { return errorResponse(e); }
}

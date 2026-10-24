import { nextAction } from '@/lib/agent/policy';
import { ensureBootstrap } from '@/lib/train/bootstrap';
import { findVersion } from '@/lib/db/queries';
import type { ShopState } from '@/lib/shop/state';
import { errorResponse, ok, parseJson } from '../../_lib/http';
import { StepRequestS } from '../../_lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const p = await parseJson(req, StepRequestS);
  if ('res' in p) return p.res;
  try {
    const { state, seed, bugs, ...stepReq } = p.data;
    // [G] Cold instance (no DATABASE_URL): the adapter's versions only exist after bootstrap, so a fresh lambda
    // would silently serve the naive base model on the RETRY lane. Signal: the client names a version we don't know.
    const vid = stepReq.modelRef.versionId;
    if ((stepReq.lane === 'adapted' || stepReq.lane === 'icl') && vid && vid !== 'v1' && !(await findVersion(vid))) await ensureBootstrap();
    // A malformed client state must not 500 the step nor poison augmentation later: drop it.
    const shop = looksLikeShopState(state) ? (state as unknown as ShopState) : undefined;
    const res = await nextAction(stepReq, shop, { seed, bugs });
    return ok(res);
  } catch (e) { return errorResponse(e); }
}

function looksLikeShopState(s: unknown): boolean {
  const x = s as { layout?: { seed?: unknown }; cart?: unknown; openModals?: unknown; page?: unknown } | undefined;
  return !!x && typeof x.layout === 'object' && x.layout !== null && typeof x.layout.seed === 'number'
    && Array.isArray(x.cart) && Array.isArray(x.openModals) && typeof x.page === 'string';
}

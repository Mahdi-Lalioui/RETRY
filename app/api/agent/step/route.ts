import { nextAction } from '@/lib/agent/policy';
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

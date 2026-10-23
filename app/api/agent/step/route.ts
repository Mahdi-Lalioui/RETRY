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
    const res = await nextAction(stepReq, state as unknown as ShopState | undefined, { seed, bugs });
    return ok(res);
  } catch (e) { return errorResponse(e); }
}

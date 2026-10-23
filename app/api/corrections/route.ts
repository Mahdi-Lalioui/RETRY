import { repo } from '@/lib/db';
import { resolveTarget } from '@/lib/shop/engine';
import type { ShopState } from '@/lib/shop/state';
import { augmentCorrection } from '@/lib/train/augment';
import { errorResponse, fail, ok, parseJson, parseQuery, runAfter } from '../_lib/http';
import { CorrectionPostS, CorrectionQueryS } from '../_lib/schemas';
import { sendCorrection } from '../_lib/feedback';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const p = await parseJson(req, CorrectionPostS);
  if ('res' in p) return p.res;
  try {
    const { stepId, goodAction, rule, note } = p.data;
    const step = await repo.steps.get(stepId);
    if (!step) return fail(`unknown stepId ${stepId}`, 404);
    const run = await repo.runs.get(step.runId);
    const user = step.messages.find((m) => m.role === 'user')?.content ?? '';
    const goal = user.match(/GOAL:\s*(.*)/)?.[1] ?? '';
    const state = step.state as ShopState | null;
    let semKey: string | null = null;
    if (state && goodAction.target) { try { semKey = resolveTarget(state, goodAction.target) ?? null; } catch { semKey = null; } }
    const human = await repo.corrections.insert({
      stepId, runId: step.runId, source: 'human', rule: rule === 'Other' ? (note ? `Other: ${note}` : 'Other') : rule ?? null,
      goal, messages: step.messages, badAction: step.action, goodAction, semKey, seed: run?.seed ?? null, status: 'queued', lane: run?.lane ?? null,
    });
    let augmented: Awaited<ReturnType<typeof repo.corrections.insert>>[] = [];
    try {
      const rows = await augmentCorrection(human, step);
      for (const r of rows) augmented.push(await repo.corrections.insert({ ...r, source: 'augmented', parentId: human.id, status: r.status ?? 'queued' }));
    } catch (e) { console.error('[corrections] augmentation failed', (e as Error).message); augmented = []; }

    runAfter(async () => {
      await sendCorrection(human, step.callId);
      for (const a of augmented) await sendCorrection(a, null);
    });
    return ok({ correctionId: human.id, augmented: augmented.length, semKey });
  } catch (e) { return errorResponse(e); }
}

export async function GET(req: Request) {
  const q = parseQuery(req, CorrectionQueryS);
  if ('res' in q) return q.res;
  try {
    const { limit = 200, rule, source, status } = q.data;
    return ok(await repo.corrections.list({ limit, rule, source, status }));
  } catch (e) { return errorResponse(e); }
}

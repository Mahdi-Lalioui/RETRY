import { judge } from '@/lib/shop/oracle';
import { getTask } from '@/lib/shop/tasks';
import type { ShopState } from '@/lib/shop/state';
import type { AgentAction, Verdict } from '@/lib/agent/types';
import { repo } from '@/lib/db';
import { runStepStats } from '@/lib/db/queries';
import { getMubit } from '@/lib/mubit';
import { memoryFallbackEnabled, recordRunOutcome } from '@/lib/mubit/memory-fallback';
import { errorResponse, fail, ok, parseJson, runAfter } from '../../_lib/http';
import { FinishS, ShopStateS } from '../../_lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const p = await parseJson(req, FinishS);
  if ('res' in p) return p.res;
  try {
    const { runId, lane, taskId, finalAction, stuck } = p.data;
    let raw: unknown = p.data.finalState ?? p.data.finalStateDigest;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return fail('finalStateDigest must be ShopState JSON'); } }
    const parsedState = ShopStateS.safeParse(raw);
    if (!parsedState.success) return fail('finalState must be a valid ShopState');
    const state: ShopState = parsedState.data;
    const task = getTask(taskId);
    const verdict: Verdict = judge(task, state, finalAction as AgentAction | null, { stuck });

    const stats = await runStepStats(runId);
    const patch = {
      status: verdict.status, correct: verdict.correct, reason: verdict.reason, violations: verdict.violations,
      endedAt: new Date(), layoutTag: state.layout.layoutTag, bugs: state.bugs, ...stats,
    };
    const existing = await repo.runs.get(runId);
    if (existing) await repo.runs.update(runId, patch);
    else await repo.runs.insert({ id: runId, lane, model: 'unknown', taskId, seed: state.layout.seed, ...patch });

    runAfter(async () => {
      if (memoryFallbackEnabled()) {
        await recordRunOutcome({ runId, referenceId: `run:${runId}`, outcome: verdict.correct ? 'success' : 'failure', signal: verdict.correct ? 1 : -1, rationale: verdict.reason });
      }
      if (process.env.SEND_ACCEPTED === 'true' && verdict.correct && verdict.status === 'passed') {
        const steps = await repo.steps.list({ runId });
        for (const s of steps) await getMubit().submitFeedback({ callId: s.callId, input: s.messages, preferredOutput: JSON.stringify(s.action), label: 'accepted', score: 1, tags: ['accepted', lane] });
      }
    });
    return ok(verdict);
  } catch (e) { return errorResponse(e); }
}

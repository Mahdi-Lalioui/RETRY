// OWNED BY AGENT D — POST /api/attract/run {seed≥10000, taskId, bugs, versionIndex} → server-simulated GPT + RETRY runs
// (same engine as the shop; /attract replays the actions in real iframes). Not persisted.
import { z } from 'zod';
import { simulateRun } from '@/lib/agent/sim';
import { getTask } from '@/lib/shop/tasks';
import { parseBugs } from '@/lib/shop/bugs';
import { repo } from '@/lib/db';
import { mubitMode } from '@/lib/mubit';
import { withMockFast } from '@/lib/mubit/mock';
import { JUDGE_SEED_MIN } from '@/lib/eval/suite';
import { ensureBootstrap } from '@/lib/train/bootstrap';
import { errorResponse, fail, ok, parseJson } from '../../_lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

const S = z.object({ seed: z.number().int(), taskId: z.string(), bugs: z.string().default(''), versionIndex: z.number().int().min(1).default(2) });

export async function POST(req: Request) {
  const p = await parseJson(req, S);
  if ('res' in p) return p.res;
  try {
    if (p.data.seed < JUDGE_SEED_MIN) return fail(`attract/judge seeds must be ≥ ${JUDGE_SEED_MIN}`);
    await ensureBootstrap();
    const task = getTask(p.data.taskId);
    const bugs = parseBugs(p.data.bugs);
    const current = await repo.versions.current();
    const sim = (lane: 'closed' | 'adapted') => simulateRun({ task, seed: p.data.seed, versionIndex: p.data.versionIndex, bugs, lane });
    const run = async () => Promise.all([sim('closed'), sim('adapted')]);
    const [closed, adapted] = mubitMode() === 'mock' ? await withMockFast(run) : await run();
    const pack = (r: Awaited<ReturnType<typeof sim>>) => ({
      verdict: r.verdict, steps: r.steps.map((s) => ({ action: s.action, result: s.result, latencyMs: s.latencyMs, costUsd: s.costUsd })),
      layoutTag: r.finalState.layout.layoutTag,
    });
    return ok({ mode: mubitMode(), version: current.label, task: { id: task.id, goal: task.goal }, closed: pack(closed), adapted: pack(adapted) });
  } catch (e) { return errorResponse(e); }
}

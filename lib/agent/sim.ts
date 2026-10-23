// plan §13.2 — server-side simulator (no DOM): engine.act + snapshot + decide + oracle.
import { nanoid } from 'nanoid';
import type { AgentAction, HistoryItem, LaneId, ModelRef, StepResponse, Task, Verdict } from './types';
import type { BugId, ShopState } from '@/lib/shop/state';
import { initialState, act } from '@/lib/shop/engine';
import { renderSnapshot } from '@/lib/shop/snapshot';
import { judge } from '@/lib/shop/oracle';
import { decide, resolveModelRef } from './policy';
import { stuckReason } from './stuck';
import { LANES } from './lanes';
import { repo } from '@/lib/db';
import { loadIclExamples, median } from '@/lib/db/queries';

export interface SimStep {
  idx: number; snapshot: string; action: AgentAction; result: HistoryItem['result'];
  latencyMs: number; usage: { in: number; out: number }; costUsd: number | null; promptChars: number; parseOk: boolean; stepId: string;
}
export interface SimOpts {
  task: Task; seed: number; versionIndex: number; bugs: BugId[]; lane: LaneId; modelRef?: ModelRef; maxSteps?: number;
  persist?: boolean; evalId?: string; runId?: string;
}
export interface SimResult { runId: string; verdict: Verdict; steps: SimStep[]; finalState: ShopState }

export async function simulateRun(o: SimOpts): Promise<SimResult> {
  const maxSteps = o.maxSteps ?? Number(process.env.MAX_STEPS ?? 16);
  const runId = o.runId ?? `sim_${nanoid(10)}`;
  const { ref, versionId } = await resolveModelRef(o.lane, o.modelRef ?? LANES[o.lane].modelRef());
  const iclExamples = o.lane === 'icl' ? await loadIclExamples() : undefined;
  let state = initialState(o.seed, o.versionIndex, o.bugs);
  const history: HistoryItem[] = [];
  const steps: SimStep[] = [];
  let verdict: Verdict | null = null;
  let finalAction: AgentAction | null = null;

  for (let idx = 0; idx < maxSteps; idx++) {
    const snapshot = renderSnapshot(state);
    const res: StepResponse & { messages: unknown } = await decide({
      runId, lane: o.lane, taskId: o.task.id, goal: o.task.goal, snapshot, history, modelRef: ref, stepIdx: idx,
    }, { iclExamples });
    const before = state;
    const a = res.action;
    let result: HistoryItem['result'] = res.parseOk ? 'ok' : 'invalid';
    if (a.type === 'done' || a.type === 'report_bug') {
      finalAction = a;
      steps.push(mk(idx, snapshot, res, result));
      if (o.persist) await persistStep(runId, idx, snapshot, res, result, before);
      verdict = judge(o.task, state, a);
      break;
    }
    if (res.parseOk) {
      const r = act(state, a);
      state = r.state; result = r.result;
    }
    history.push({ action: a, result });
    steps.push(mk(idx, snapshot, res, result));
    if (o.persist) await persistStep(runId, idx, snapshot, res, result, before);
    const why = stuckReason(history, before.violations.length, state.violations.length, maxSteps);
    if (why === 'violation') {
      const v = [...new Set(state.violations)];
      verdict = { status: 'violation', correct: false, reason: `Policy violation ${state.violations[state.violations.length - 1]}`, violations: v };
      break;
    }
    if (why) { verdict = judge(o.task, state, null, { stuck: true }); break; }
  }
  if (!verdict) verdict = judge(o.task, state, finalAction, { stuck: true });

  if (o.persist) {
    const lat = steps.map((s) => s.latencyMs);
    const costs = steps.map((s) => s.costUsd).filter((x): x is number => x !== null);
    await repo.runs.insert({
      id: runId, lane: o.lane, model: ref.model, versionId, taskId: o.task.id, seed: o.seed, layoutTag: state.layout.layoutTag,
      bugs: o.bugs, status: verdict.status, correct: verdict.correct, reason: verdict.reason, violations: verdict.violations,
      steps: steps.length, costUsd: costs.length ? costs.reduce((x, y) => x + y, 0) : null, latencyP50: median(lat),
      promptChars: steps.length ? Math.round(steps.reduce((n, s) => n + s.promptChars, 0) / steps.length) : null,
      isEval: !!o.evalId, evalId: o.evalId ?? null, endedAt: new Date(),
    });
  }
  return { runId, verdict, steps, finalState: state };
}

function mk(idx: number, snapshot: string, r: StepResponse, result: HistoryItem['result']): SimStep {
  return { idx, snapshot, action: r.action, result, latencyMs: r.latencyMs, usage: r.usage, costUsd: r.costUsd, promptChars: r.promptChars, parseOk: r.parseOk, stepId: r.stepId };
}

async function persistStep(runId: string, idx: number, snapshot: string, r: StepResponse & { messages: unknown }, result: string, state: ShopState) {
  await repo.steps.insert({
    id: r.stepId, runId, idx, snapshot, messages: r.messages as never, raw: r.raw, action: r.action, result, callId: r.callId,
    latencyMs: r.latencyMs, tokensIn: r.usage.in, tokensOut: r.usage.out, costUsd: r.costUsd, promptChars: r.promptChars, state,
  });
}

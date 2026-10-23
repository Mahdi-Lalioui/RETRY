// plan §9.4 — one model call per step via Mubit; one retry on invalid target (§9.3).
import { nanoid } from 'nanoid';
import type { StepRequest, StepResponse, ModelRef, AgentAction } from './types';
import type { Msg } from '@/lib/mubit/types';
import type { ShopState } from '@/lib/shop/state';
import { getMubit } from '@/lib/mubit';
import { buildMessages, promptChars, snapshotIds } from './prompt';
import { INVALID_FALLBACK, parseAction, retryMessage } from './parse';
import { costUsd } from '@/lib/pricing';
import { repo } from '@/lib/db';
import { findVersion, loadIclExamples } from '@/lib/db/queries';

export interface DecideOpts { iclExamples?: string[] }

export async function decide(req: StepRequest, opts: DecideOpts = {}): Promise<StepResponse & { messages: Msg[] }> {
  const mubit = getMubit();
  const messages = buildMessages({ goal: req.goal, history: req.history, snapshot: req.snapshot, lane: req.lane, iclExamples: opts.iclExamples });
  const ids = snapshotIds(req.snapshot);
  const base = {
    model: req.modelRef.model, versionId: req.modelRef.versionId, temperature: 0, seed: 7, jsonMode: true,
    metadata: { task: 'retry-next-action', lane: req.lane, runId: req.runId, stepIdx: String(req.stepIdx) },
  };
  let res = await mubit.chat({ ...base, messages });
  let usage = { ...res.usage }; let latencyMs = res.latencyMs; let raw = res.text;
  let parsed = parseAction(res.text, ids);
  let convo = messages;
  if (!parsed.action) {
    convo = [...messages, { role: 'assistant', content: res.text }, { role: 'user', content: retryMessage(parsed.badTarget) }];
    res = await mubit.chat({ ...base, messages: convo });
    usage = { in: usage.in + res.usage.in, out: usage.out + res.usage.out };
    latencyMs += res.latencyMs; raw = res.text;
    parsed = parseAction(res.text, ids);
  }
  const action: AgentAction = parsed.action ?? INVALID_FALLBACK;
  return {
    stepId: `step_${nanoid(10)}`, action, callId: res.callId, latencyMs, usage,
    costUsd: costUsd(req.modelRef.model, usage), raw, parseOk: !!parsed.action,
    promptChars: promptChars(messages), messages,
  };
}

/** Fill in the adapted lane's promoted version and map our version id → Mubit version id. */
export async function resolveModelRef(lane: StepRequest['lane'], ref: ModelRef): Promise<{ ref: ModelRef; versionId: string | null }> {
  if (ref.kind !== 'open' || (lane !== 'adapted' && !ref.versionId)) return { ref, versionId: null };
  const v = ref.versionId ? await findVersion(ref.versionId) : await repo.versions.current();
  if (!v || (v.examples ?? 0) === 0) return { ref: { ...ref, versionId: undefined }, versionId: v?.id ?? null };
  return { ref: { ...ref, versionId: v.mubitVersionId ?? v.id }, versionId: v.id };
}

export async function nextAction(req: StepRequest, state?: ShopState, extra: { seed?: number; bugs?: string[]; isEval?: boolean; evalId?: string } = {}): Promise<StepResponse> {
  const { ref, versionId } = await resolveModelRef(req.lane, req.modelRef);
  const iclExamples = req.lane === 'icl' ? await loadIclExamples() : undefined;
  const out = await decide({ ...req, modelRef: ref }, { iclExamples });
  const run = await repo.runs.get(req.runId);
  if (!run) {
    await repo.runs.insert({
      id: req.runId, lane: req.lane, model: ref.model, versionId, taskId: req.taskId,
      seed: extra.seed ?? state?.layout.seed ?? 0,
      layoutTag: state?.layout.layoutTag ?? req.snapshot.match(/LAYOUT\s+(\S+)/)?.[1] ?? 'unknown',
      bugs: extra.bugs ?? state?.bugs ?? [], status: 'running', isEval: extra.isEval ?? false, evalId: extra.evalId ?? null,
    });
  }
  const lastResult = req.history[req.history.length - 1]?.result;
  if (req.stepIdx > 0 && lastResult) {
    const prev = (await repo.steps.list({ runId: req.runId })).find((s) => s.idx === req.stepIdx - 1);
    if (prev && !prev.result) await repo.steps.update(prev.id, { result: lastResult });
  }
  await repo.steps.insert({
    id: out.stepId, runId: req.runId, idx: req.stepIdx, snapshot: req.snapshot, messages: out.messages, raw: out.raw,
    action: out.action, result: out.parseOk ? null : 'invalid', callId: out.callId, latencyMs: out.latencyMs,
    tokensIn: out.usage.in, tokensOut: out.usage.out, costUsd: out.costUsd, promptChars: out.promptChars, state: state ?? null,
  });
  await repo.runs.update(req.runId, { steps: req.stepIdx + 1 });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { messages, ...resp } = out;
  return resp;
}

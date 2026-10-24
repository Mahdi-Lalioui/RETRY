// plan §9.4 — one model call per step via Mubit; one retry on invalid target (§9.3).
import { nanoid } from 'nanoid';
import type { StepRequest, StepResponse, ModelRef, AgentAction } from './types';
import type { Msg } from '@/lib/mubit/types';
import type { ShopState } from '@/lib/shop/state';
import { getMubitFor, liveLanes } from '@/lib/mubit';
import { inMockFast } from '@/lib/mubit/mock';
import { RULES } from '@/lib/shop/rules';
import type { RuleId } from '@/lib/shop/state';
import { buildMessages, promptChars, snapshotIds } from './prompt';
import { INVALID_FALLBACK, parseAction, retryMessage } from './parse';
import { costUsd } from '@/lib/pricing';
import { repo } from '@/lib/db';
import { findVersion, loadIclExamples } from '@/lib/db/queries';
import { LANES } from './lanes';

export interface DecideOpts { iclExamples?: string[] }

export async function decide(req: StepRequest, opts: DecideOpts = {}): Promise<StepResponse & { messages: Msg[] }> {
  const mubit = getMubitFor(req.lane);
  let messages = buildMessages({ goal: req.goal, history: req.history, snapshot: req.snapshot, lane: req.lane, iclExamples: opts.iclExamples });
  const ids = snapshotIds(req.snapshot);
  const live = await liveRetry(req, messages);
  if (live) messages = live.messages;
  const base = {
    model: live?.model ?? req.modelRef.model, versionId: live ? undefined : req.modelRef.versionId, temperature: 0, seed: 7, jsonMode: true,
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
    costUsd: costUsd(live?.model ?? req.modelRef.model, usage), raw, parseOk: !!parsed.action,
    promptChars: promptChars(messages), messages,
  };
}

/** Fill in the adapted lane's promoted version and map our version id → Mubit version id. */
export async function resolveModelRef(lane: StepRequest['lane'], ref: ModelRef): Promise<{ ref: ModelRef; versionId: string | null }> {
  // Browser bundles cannot read server-only model env vars. Resolve the model on the server,
  // and never let a public request select an arbitrary billable provider model.
  const configured = LANES[lane].modelRef();
  ref = { ...ref, kind: configured.kind, model: configured.model };
  if (lane !== 'adapted') return { ref: { ...ref, versionId: undefined }, versionId: null };
  // A client-held versionId may be unknown here (in-memory DB per Vercel instance, or a label from the badge): fall back
  // to the label, then to this instance's promoted version — never silently to the naive base model.
  const label = ref.label?.match(/\bv\d+\b/)?.[0];
  const v = (ref.versionId ? await findVersion(ref.versionId) : null)
    ?? (lane === 'adapted' && label ? await findVersion(label) : null)
    ?? (lane === 'adapted' ? await repo.versions.current() : null);
  if (!v || v.id === 'v1') return { ref: { ...ref, versionId: undefined }, versionId: v?.id ?? null };
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

/** Live RETRY lane (MUBIT_LIVE_LANES includes "adapted"): a real model through Mubit, given the house-policy notes
 *  compiled from the rules humans tagged in rescues for the serving version. Its correct calls form their own Mubit
 *  task (distinct instructions), which Mubit can train an adapter on. Simulated runs (eval/bootstrap) never take this path. */
export const RETRY_LIVE_SUFFIX = '\nYou are the RETRY lane: apply every line of the HOUSE TEST POLICY given in the user message.';
async function liveRetry(req: StepRequest, messages: Msg[]): Promise<{ model: string; messages: Msg[] } | null> {
  if (req.lane !== 'adapted' || inMockFast() || !liveLanes().includes('adapted')) return null;
  const v = req.modelRef.versionId ? await findVersion(req.modelRef.versionId) : await repo.versions.current();
  const tags = (v?.rules ?? []) as string[];
  const notes = tags.filter((t): t is RuleId => t in RULES).map((t) => `- ${RULES[t].title}`);
  if (tags.includes('BUG')) notes.push('- If checkout shows broken data (e.g. £NaN, a 500 page, a pay button that does nothing, no order number), use report_bug with the evidence.');
  const policy = `HOUSE TEST POLICY (compiled from human rescues · ${v?.label ?? 'v1'}):\n${notes.length ? notes.join('\n') : '- (no rules learned yet)'}\n\n`;
  const [sys, ...rest] = messages;
  const user = rest[rest.length - 1];
  return {
    model: `closed:${process.env.LIVE_RETRY_MODEL || process.env.CLOSED_MODEL || 'gpt-4o-mini'}`,
    messages: [{ ...sys, content: sys.content + RETRY_LIVE_SUFFIX }, ...rest.slice(0, -1), { ...user, content: policy + user.content }],
  };
}

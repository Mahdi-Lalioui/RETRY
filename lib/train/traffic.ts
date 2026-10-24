// Real gateway outputs on scripted shop checkpoints. These are never human rescues,
// and a completed chat does not establish reviewer acceptance or adapter training.
import type { AgentAction, HistoryItem } from '@/lib/agent/types';
import { buildMessages, snapshotIds } from '@/lib/agent/prompt';
import { parseAction } from '@/lib/agent/parse';
import type { Msg, MubitClient } from '@/lib/mubit/types';
import { TRAINING_SEEDS, assertDisjointPools } from '@/lib/eval/suite';
import { act, initialState } from '@/lib/shop/engine';
import { BUG_IDS, bugsAffecting } from '@/lib/shop/bugs';
import type { BugId, PageId, ShopState } from '@/lib/shop/state';
import { renderSnapshot } from '@/lib/shop/snapshot';
import { solveStep } from '@/lib/shop/solver';
import { TASKS } from '@/lib/shop/tasks';

const SOURCE = 'scripted-state-real-gateway-output' as const;

export interface TrainingSample {
  localId: string; source: typeof SOURCE; seed: number; taskId: string; bugs: BugId[];
  page: PageId; stepIdx: number; snapshot: string; messages: Msg[]; expectedAction: AgentAction;
}

/** Deterministic, disjoint inputs; every fourth checkpoint contains visible bug evidence. */
export function generateTrainingSamples(examples = 60): TrainingSample[] {
  if (!Number.isInteger(examples) || examples < 1 || examples > 200) throw new Error('examples must be an integer from 1 to 200');
  assertDisjointPools();
  return Array.from({ length: examples }, (_, index) => {
    const seed = TRAINING_SEEDS.min + index;
    const bug = index % 4 === 3 ? BUG_IDS[Math.floor(index / 4) % BUG_IDS.length] : undefined;
    const eligible = bug === 'coupon_500' ? TASKS.filter((t) => t.wantsCoupon) : TASKS;
    const task = eligible[index % eligible.length];
    const bugs = bug ? bugsAffecting(task, [bug]) : [];
    let state = initialState(seed, 1, bugs, { collectRequired: task.wantsCollect });
    if (state.layout.extraRules.length) throw new Error('Training checkpoints must hold back R7; configure its reveal after layout version 1');
    const history: HistoryItem[] = [];
    const checkpoints: { state: ShopState; history: HistoryItem[]; action: AgentAction }[] = [];
    for (let step = 0; step < 64; step++) {
      const action = solveStep(task, state);
      checkpoints.push({ state, history: [...history], action });
      if (action.type === 'done' || action.type === 'report_bug') break;
      const next = act(state, action);
      history.push({ action, result: next.result });
      state = next.state;
    }
    const selected = bug ? checkpoints.at(-1)! : checkpoints[(index * 7) % checkpoints.length];
    if (bug && selected.action.type !== 'report_bug') throw new Error(`Bug checkpoint did not manifest for ${task.id}`);
    const localId = `retry-training-${String(seed).padStart(3, '0')}`;
    const snapshot = renderSnapshot(selected.state);
    // The documented no-metadata session fallback hashes the first user message.
    // A visible case identifier makes every checkpoint distinct without changing the system instruction.
    const messages = buildMessages({ goal: `${task.goal} QA case ${localId}.`, history: selected.history, snapshot, lane: 'closed' });
    return { localId, source: SOURCE, seed, taskId: task.id, bugs, page: selected.state.page,
      stepIdx: selected.history.length, snapshot, messages, expectedAction: selected.action };
  });
}

export interface TrainingRecord extends TrainingSample {
  requestedModel: string; status: 'ok' | 'invalid_output' | 'provider_error'; callId: string | null;
  usage: { in: number; out: number } | null; latencyMs: number;
  raw: string | null; parseOk: boolean; action: AgentAction | null; error?: string;
}

export interface TrainingTrafficReport {
  source: typeof SOURCE; requestedModel: string; requested: number; attempted: number; completed: number;
  validOutputs: number; invalidOutputs: number; providerErrors: number; skipped: number;
  stoppedEarly: boolean; records: TrainingRecord[];
}

export function redactTrainingText(value: string, secrets: (string | undefined)[] = []): string {
  return secrets.filter((key): key is string => !!key).reduce((text, key) => text.replaceAll(key, '[redacted]'), value);
}

export async function runTrainingTraffic(client: Pick<MubitClient, 'chat'>, options: {
  examples?: number; model: string; concurrency?: number; secrets?: (string | undefined)[];
}): Promise<TrainingTrafficReport> {
  const samples = generateTrainingSamples(options.examples);
  if (!options.model.trim()) throw new Error('A configured requested model is required');
  if (options.concurrency !== undefined && (!Number.isInteger(options.concurrency) || options.concurrency < 1)) throw new Error('concurrency must be a positive integer');
  const concurrency = Math.min(3, options.concurrency ?? 3);
  const clean = (value: string) => redactTrainingText(value, options.secrets);
  const records: TrainingRecord[] = [];
  let providerErrors = 0;
  // Batches bound in-flight calls and let every error in a batch settle before more spending.
  for (let offset = 0; offset < samples.length && providerErrors < 3; offset += concurrency) {
    const batch = await Promise.all(samples.slice(offset, offset + concurrency).map(async (sample): Promise<TrainingRecord> => {
      const started = Date.now();
      try {
        const res = await client.chat({ model: options.model, messages: sample.messages, temperature: 0, seed: 7, jsonMode: true });
        const raw = clean(res.text);
        const parsed = parseAction(raw, snapshotIds(sample.snapshot));
        return { ...sample, requestedModel: options.model, status: parsed.action ? 'ok' : 'invalid_output',
          callId: res.callId ? clean(res.callId) : null, usage: res.usage, latencyMs: res.latencyMs,
          raw, parseOk: !!parsed.action, action: parsed.action, ...(parsed.error ? { error: clean(parsed.error) } : {}) };
      } catch (error) {
        providerErrors++;
        return { ...sample, requestedModel: options.model, status: 'provider_error', callId: null, usage: null,
          latencyMs: Date.now() - started, raw: null, parseOk: false, action: null,
          error: clean(error instanceof Error ? error.message : String(error)) };
      }
    }));
    records.push(...batch);
  }
  const completed = records.filter((r) => r.status !== 'provider_error').length;
  const validOutputs = records.filter((r) => r.parseOk).length;
  return { source: SOURCE, requestedModel: options.model, requested: samples.length, attempted: records.length,
    completed, validOutputs, invalidOutputs: completed - validOutputs, providerErrors,
    skipped: samples.length - records.length, stoppedEarly: records.length < samples.length, records };
}

export function trainingTrafficSummary(report: TrainingTrafficReport): string {
  return `${report.completed}/${report.requested} real gateway responses; ${report.validOutputs} valid action outputs; `
    + `${report.invalidOutputs} invalid outputs; ${report.providerErrors} provider errors; ${report.skipped} skipped. `
    + 'Check the Mubit console for reviewer acceptance, training, serving status, and actual served model/adapter identity.';
}

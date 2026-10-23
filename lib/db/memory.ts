// In-memory repo with the IDENTICAL API to the Neon repo (plan §17). Used when DATABASE_URL is missing.
import { nanoid } from 'nanoid';
import type {
  Repo, WithOptionalId, Run, NewRun, Step, NewStep, Correction, NewCorrection, ModelVersion, NewModelVersion, Eval, NewEval, Table,
} from './schema';

export function seedVersion(): NewModelVersion {
  return {
    id: 'v1', label: 'v1', baseModel: process.env.OPEN_BASE_MODEL || 'open-base', examples: 0, status: 'ready',
    promoted: true, rules: [], createdAt: new Date(0), readyAt: new Date(0), mubitVersionId: null,
  };
}

const ts = (d: Date | null | undefined) => (d ? d.getTime() : 0);

export function fillRun(r: WithOptionalId<NewRun>): Run {
  return { versionId: null, correct: null, reason: null, violations: null, steps: 0, costUsd: null, latencyP50: null, promptChars: null, isEval: false,
    evalId: null, startedAt: new Date(), endedAt: null, ...r, id: r.id ?? `run_${nanoid(10)}` } as Run;
}
export function fillStep(r: WithOptionalId<NewStep>): Step {
  return { raw: null, result: null, callId: null, latencyMs: null, tokensIn: null, tokensOut: null, costUsd: null,
    promptChars: null, state: null, ...r, id: r.id ?? `step_${nanoid(10)}` } as Step;
}
export function fillCorrection(r: WithOptionalId<NewCorrection>): Correction {
  return { stepId: null, runId: null, parentId: null, rule: null, badAction: null, semKey: null, seed: null,
    mubitFeedbackId: null, versionId: null, lane: null, createdAt: new Date(), ...r, id: r.id ?? `cor_${nanoid(10)}` } as Correction;
}
export function fillVersion(r: WithOptionalId<NewModelVersion>): ModelVersion {
  return { mubitVersionId: null, examples: 0, promoted: false, heldBackReason: null, createdAt: new Date(), readyAt: null,
    metrics: null, rules: [], jobId: null, ...r, id: r.id ?? `ver_${nanoid(8)}` } as ModelVersion;
}
export function fillEval(r: WithOptionalId<NewEval>): Eval {
  return { versionId: null, lane: null, total: 0, done: 0, metrics: null, createdAt: new Date(), ...r, id: r.id ?? `eval_${nanoid(8)}` } as Eval;
}

function table<T extends { id: string }, N, F>(
  fill: (n: WithOptionalId<N>) => T,
  match: (row: T, f: F) => boolean,
  order: (a: T, b: T) => number,
  limitOf: (f: F) => number | undefined,
): Table<T, N, F> & { _rows: Map<string, T> } {
  const rows = new Map<string, T>();
  return {
    _rows: rows,
    async insert(n) { const r = fill(n); rows.set(r.id, r); return structuredClone(r); },
    async update(id, patch) {
      const r = rows.get(id); if (!r) return null;
      const next = { ...r, ...patch, id: r.id } as T; rows.set(id, next); return structuredClone(next);
    },
    async get(id) { const r = rows.get(id); return r ? structuredClone(r) : null; },
    async list(f) {
      const ff = (f ?? {}) as F;
      const out = [...rows.values()].filter((r) => match(r, ff)).sort(order);
      const lim = limitOf(ff);
      return structuredClone(lim ? out.slice(0, lim) : out);
    },
  };
}

const eq = <V>(want: V | undefined, got: V) => want === undefined || want === got;

export function createMemoryRepo(): Repo {
  const runs = table<Run, NewRun, import('./schema').RunFilter>(fillRun,
    (r, f) => eq(f.lane, r.lane) && eq(f.isEval, !!r.isEval) && eq(f.evalId, r.evalId ?? undefined) && eq(f.taskId, r.taskId) && eq(f.versionId, r.versionId ?? undefined),
    (a, b) => ts(b.startedAt) - ts(a.startedAt), (f) => f.limit);
  const steps = table<Step, NewStep, import('./schema').StepFilter>(fillStep,
    (r, f) => eq(f.runId, r.runId), (a, b) => (a.runId === b.runId ? a.idx - b.idx : a.runId < b.runId ? -1 : 1), (f) => f.limit);
  const corrections = table<Correction, NewCorrection, import('./schema').CorrectionFilter>(fillCorrection,
    (r, f) => eq(f.rule, r.rule ?? undefined) && eq(f.source, r.source) && eq(f.status, r.status) && eq(f.versionId, r.versionId ?? undefined)
      && eq(f.runId, r.runId ?? undefined) && eq(f.stepId, r.stepId ?? undefined) && eq(f.parentId, r.parentId ?? undefined),
    (a, b) => ts(b.createdAt) - ts(a.createdAt), (f) => f.limit);
  const versionsT = table<ModelVersion, NewModelVersion, import('./schema').VersionFilter>(fillVersion,
    (r, f) => eq(f.status, r.status), (a, b) => ts(a.createdAt) - ts(b.createdAt), () => undefined);
  const evals = table<Eval, NewEval, import('./schema').EvalFilter>(fillEval,
    (r, f) => eq(f.versionId, r.versionId ?? undefined) && eq(f.lane, r.lane ?? undefined),
    (a, b) => ts(b.createdAt) - ts(a.createdAt), (f) => f.limit);

  const v1 = fillVersion(seedVersion());
  versionsT._rows.set(v1.id, v1);

  const versions: Repo['versions'] = {
    insert: versionsT.insert, update: versionsT.update, get: versionsT.get, list: versionsT.list,
    async current() {
      const all = await versionsT.list();
      return all.filter((v) => v.promoted).pop() ?? all[0];
    },
    async promote(id) {
      if (!versionsT._rows.has(id)) return null;
      for (const v of versionsT._rows.values()) v.promoted = v.id === id;
      return versionsT.get(id);
    },
  };
  return { kind: 'memory', runs, steps, corrections, versions, evals };
}

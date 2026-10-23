// Deterministic demo bootstrap (plan §12.3 + §13): scripted backlog → corrections (+×8 augmented) → Mubit feedback →
// refreshes v2, v3, v4 (each evaluated on the 48-run held-out suite and gated) → baselines (GPT, Base v1, ICL).
// Idempotent and cached per server instance (Vercel lambdas each have their own in-memory DB, so every instance
// lazily rebuilds the same data). On REAL Mubit we never fabricate versions: only corrections + feedback + baselines.
import { repo, type Correction } from '@/lib/db';
import { mubitMode } from '@/lib/mubit';
import { withMockFast } from '@/lib/mubit/mock';
import { sendCorrection } from '@/app/api/_lib/feedback';
import { refreshStatus, startRefresh, ensureVersionEval } from '@/app/api/_lib/refresh';
import { latestFinished, runEval } from '@/lib/eval/runner';
import { augmentCorrection } from './augment';
import { collectBacklog, type ScriptedRescue } from './backlog';

export interface BootstrapSummary {
  ran: boolean; mode: 'real' | 'mock'; ms: number; scripted: number; examples: number;
  byRule: Record<string, number>; versions: { label: string; examples: number; phase: string; verifiedSuccess: number | null; bugRecall: number | null }[];
}

/** Batches → one version each, so the learning curve has real points with growing example counts. */
const BATCHES: (string | null)[][] = [['R5', 'R1', 'R3', 'R4'], ['R6', 'BUG'], ['R2', null]];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function insertRescue(r: ScriptedRescue): Promise<Correction[]> {
  const c = await repo.corrections.insert({
    source: 'scripted', rule: r.rule, goal: r.task.goal, messages: r.messages, badAction: r.badAction, goodAction: r.goodAction,
    semKey: r.semKey, seed: r.seed, status: 'queued', lane: 'base', createdAt: new Date(),
  });
  const rows = await augmentCorrection(c, null, { state: r.state, history: r.history });
  const aug: Correction[] = [];
  for (const row of rows) aug.push(await repo.corrections.insert({ ...row, createdAt: new Date() }));
  for (const x of [c, ...aug]) await sendCorrection(x, null);
  return [c, ...aug];
}

async function withEnv<T>(k: string, v: string, fn: () => Promise<T>): Promise<T> {
  const old = process.env[k]; process.env[k] = v;
  try { return await fn(); } finally { if (old === undefined) delete process.env[k]; else process.env[k] = old; }
}

export async function isBootstrapped(): Promise<boolean> {
  return (await repo.corrections.list({ source: 'scripted', limit: 1 })).length > 0;
}

async function run(): Promise<BootstrapSummary> {
  const t0 = Date.now();
  const mode = mubitMode();
  if (await isBootstrapped()) return summary(false, mode, t0);
  const rescues = await withMockFast(() => collectBacklog());
  const work = async () => {
    // closed (GPT) baseline + base v1 baseline before any learning
    if (!(await latestFinished({ lane: 'closed', versionId: null, suite: 'heldout' }))) await runEval({ lane: 'closed', versionId: null, suite: 'heldout', label: 'GPT' });
    const v1 = await repo.versions.get('v1');
    if (v1) await ensureVersionEval(v1);
    const used = new Set<ScriptedRescue>();
    for (const batch of BATCHES) {
      const pick = rescues.filter((r) => !used.has(r) && batch.includes(r.rule));
      for (const r of pick) { used.add(r); await insertRescue(r); }
      if (mode !== 'mock') continue;
      await sleep(3); // corrections strictly before the version's createdAt
      const job = await withEnv('MOCK_TRAIN_SECONDS', '0', () => startRefresh());
      await sleep(3);
      let st = await withEnv('MOCK_TRAIN_SECONDS', '0', () => refreshStatus(job.versionId));
      for (let i = 0; i < 20 && (st.phase === 'training' || st.phase === 'evaluating'); i++) st = await withEnv('MOCK_TRAIN_SECONDS', '0', () => refreshStatus(job.versionId));
      // ICL lane at the same correction count (prompt grows with every correction)
      const n = (await repo.corrections.list()).length;
      await runEval({ lane: 'icl', versionId: null, suite: 'heldout', label: `ICL · ${n} examples`, examples: n });
    }
  };
  if (mode === 'mock') await withMockFast(work); else await work();
  return summary(true, mode, t0);
}

async function summary(ran: boolean, mode: 'real' | 'mock', t0: number): Promise<BootstrapSummary> {
  const all = await repo.corrections.list();
  const byRule: Record<string, number> = {};
  for (const c of all.filter((x) => x.source === 'scripted' || x.source === 'human')) byRule[c.rule ?? 'stuck'] = (byRule[c.rule ?? 'stuck'] ?? 0) + 1;
  const vs = await repo.versions.list();
  return {
    ran, mode, ms: Date.now() - t0, scripted: all.filter((c) => c.source === 'scripted').length, examples: all.length, byRule,
    versions: vs.map((v) => {
      const m = v.metrics as { verifiedSuccess?: number | null; bugRecall?: number | null } | null;
      return { label: v.label, examples: v.examples ?? 0, phase: v.promoted ? 'promoted' : v.heldBackReason ? 'held_back' : v.status, verifiedSuccess: m?.verifiedSuccess ?? null, bugRecall: m?.bugRecall ?? null };
    }),
  };
}

const g = globalThis as unknown as { __retryBootstrap?: Promise<BootstrapSummary> };

/** Idempotent; concurrent callers share one in-flight bootstrap per instance. */
export function ensureBootstrap(): Promise<BootstrapSummary> {
  if (!g.__retryBootstrap) g.__retryBootstrap = run().catch((e) => { g.__retryBootstrap = undefined; throw e; });
  return g.__retryBootstrap;
}

/** Test helper. */
export function resetBootstrapCache() { g.__retryBootstrap = undefined; }

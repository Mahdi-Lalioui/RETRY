// plan.md §17 (+ model_versions.rules, steps.state)
import { pgTable, text, integer, jsonb, boolean, doublePrecision, timestamp } from 'drizzle-orm/pg-core';
import type { AgentAction } from '@/lib/agent/types';
import type { Msg } from '@/lib/mubit/types';

/** Learned skill tags stored on a version: house rules plus 'BUG' (has report_bug corrections). */
export type LearnedTag = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'BUG';

export const runs = pgTable('runs', {
  id: text('id').primaryKey(), lane: text('lane').notNull(), model: text('model').notNull(),
  versionId: text('version_id'), taskId: text('task_id').notNull(), seed: integer('seed').notNull(),
  layoutTag: text('layout_tag').notNull(), bugs: jsonb('bugs').$type<string[]>().notNull(),
  status: text('status').notNull(), correct: boolean('correct'), reason: text('reason'),
  violations: jsonb('violations').$type<string[]>(), steps: integer('steps').default(0),
  costUsd: doublePrecision('cost_usd'), latencyP50: integer('latency_p50'), promptChars: integer('prompt_chars'),
  isEval: boolean('is_eval').default(false), evalId: text('eval_id'),
  startedAt: timestamp('started_at').defaultNow(), endedAt: timestamp('ended_at'),
});
export const steps = pgTable('steps', {
  id: text('id').primaryKey(), runId: text('run_id').notNull(), idx: integer('idx').notNull(),
  snapshot: text('snapshot').notNull(), messages: jsonb('messages').$type<Msg[]>().notNull(), raw: text('raw'),
  action: jsonb('action').$type<AgentAction>().notNull(), result: text('result'), callId: text('call_id'),
  latencyMs: integer('latency_ms'), tokensIn: integer('tokens_in'), tokensOut: integer('tokens_out'),
  costUsd: doublePrecision('cost_usd'), promptChars: integer('prompt_chars'),
  state: jsonb('state'), // ShopState before the action (needed for augmentation)
});
export const corrections = pgTable('corrections', {
  id: text('id').primaryKey(), stepId: text('step_id'), runId: text('run_id'), parentId: text('parent_id'),
  source: text('source').notNull(), // human | augmented
  rule: text('rule'), goal: text('goal').notNull(), messages: jsonb('messages').$type<Msg[]>().notNull(),
  badAction: jsonb('bad_action').$type<AgentAction>(), goodAction: jsonb('good_action').$type<AgentAction>().notNull(), semKey: text('sem_key'),
  seed: integer('seed'), mubitFeedbackId: text('mubit_feedback_id'),
  status: text('status').notNull(), // queued | sent | failed | trained
  versionId: text('version_id'), lane: text('lane'), createdAt: timestamp('created_at').defaultNow(),
});
export const modelVersions = pgTable('model_versions', {
  id: text('id').primaryKey(), mubitVersionId: text('mubit_version_id'), label: text('label').notNull(),
  baseModel: text('base_model').notNull(), examples: integer('examples'), status: text('status').notNull(),
  promoted: boolean('promoted').default(false), heldBackReason: text('held_back_reason'),
  createdAt: timestamp('created_at').defaultNow(), readyAt: timestamp('ready_at'),
  metrics: jsonb('metrics'), rules: jsonb('rules').$type<LearnedTag[]>().notNull().default([]),
  jobId: text('job_id'),
});
export const evals = pgTable('evals', {
  id: text('id').primaryKey(), versionId: text('version_id'), lane: text('lane'),
  total: integer('total'), done: integer('done').default(0), metrics: jsonb('metrics'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Run = typeof runs.$inferSelect; export type NewRun = typeof runs.$inferInsert;
export type Step = typeof steps.$inferSelect; export type NewStep = typeof steps.$inferInsert;
export type Correction = typeof corrections.$inferSelect; export type NewCorrection = typeof corrections.$inferInsert;
export type ModelVersion = typeof modelVersions.$inferSelect; export type NewModelVersion = typeof modelVersions.$inferInsert;
export type Eval = typeof evals.$inferSelect; export type NewEval = typeof evals.$inferInsert;

// ---- Repo facade (identical for Neon + memory) ----
export type WithOptionalId<N> = Omit<N, 'id'> & { id?: string };
export interface Table<T, N, F> {
  insert(row: WithOptionalId<N>): Promise<T>;   // id generated (nanoid) when omitted
  update(id: string, patch: Partial<T>): Promise<T | null>;
  get(id: string): Promise<T | null>;
  list(filter?: F): Promise<T[]>;
}
export interface RunFilter { lane?: string; isEval?: boolean; evalId?: string; taskId?: string; versionId?: string; limit?: number }
export interface StepFilter { runId?: string; limit?: number }
export interface CorrectionFilter { rule?: string; source?: string; status?: string; versionId?: string; runId?: string; stepId?: string; parentId?: string; limit?: number }
export interface VersionFilter { status?: string }
export interface EvalFilter { versionId?: string; lane?: string; limit?: number }
export interface Repo {
  kind: 'neon' | 'memory';
  runs: Table<Run, NewRun, RunFilter>;          // newest first
  steps: Table<Step, NewStep, StepFilter>;      // by idx ascending
  corrections: Table<Correction, NewCorrection, CorrectionFilter>; // newest first
  versions: Table<ModelVersion, NewModelVersion, VersionFilter> & { // oldest first
    current(): Promise<ModelVersion>;           // latest promoted version (v1 seeded)
    promote(id: string): Promise<ModelVersion | null>; // un-promotes all others
  };
  evals: Table<Eval, NewEval, EvalFilter>;      // newest first
}

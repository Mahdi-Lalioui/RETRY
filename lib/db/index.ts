// `repo` facade — Neon (Drizzle) if DATABASE_URL, else in-memory (same API). plan §17, §27.
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, asc, desc, eq, type SQL } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import * as s from './schema';
import type { Repo, Table } from './schema';
import { createMemoryRepo, fillCorrection, fillEval, fillRun, fillStep, fillVersion, seedVersion } from './memory';

export * from './schema';

type AnyTable = PgTable & { id: PgColumn };

function createNeonRepo(url: string): Repo {
  const db = drizzle(neon(url), { schema: s });

  function table<T extends { id: string }, N, F extends { limit?: number }>(
    t: AnyTable, fill: (n: N) => T, where: (f: F) => (SQL | undefined)[], order: SQL,
  ): Table<T, N, F> {
    return {
      async insert(n) {
        const row = fill(n);
        const [r] = await db.insert(t).values(row as never).returning();
        return r as unknown as T;
      },
      async update(id, patch) {
        const { id: _drop, ...rest } = patch as Record<string, unknown>; void _drop;
        if (Object.keys(rest).length === 0) return this.get(id);
        const rows = await db.update(t).set(rest as never).where(eq(t.id, id)).returning();
        return (rows[0] as unknown as T) ?? null;
      },
      async get(id) {
        const rows = await db.select().from(t as PgTable).where(eq(t.id, id)).limit(1);
        return (rows[0] as unknown as T) ?? null;
      },
      async list(f) {
        const conds = where((f ?? {}) as F).filter((c): c is SQL => !!c);
        let q = db.select().from(t as PgTable).where(conds.length ? and(...conds) : undefined).orderBy(order).$dynamic();
        if (f?.limit) q = q.limit(f.limit);
        return (await q) as unknown as T[];
      },
    };
  }
  const opt = <V>(col: PgColumn, v: V | undefined) => (v === undefined ? undefined : eq(col, v as never));

  const runs = table<s.Run, s.NewRun, s.RunFilter>(s.runs, fillRun, (f) => [
    opt(s.runs.lane, f.lane), opt(s.runs.isEval, f.isEval), opt(s.runs.evalId, f.evalId), opt(s.runs.taskId, f.taskId), opt(s.runs.versionId, f.versionId),
  ], desc(s.runs.startedAt));
  const steps = table<s.Step, s.NewStep, s.StepFilter>(s.steps, fillStep, (f) => [opt(s.steps.runId, f.runId)], asc(s.steps.idx));
  const corrections = table<s.Correction, s.NewCorrection, s.CorrectionFilter>(s.corrections, fillCorrection, (f) => [
    opt(s.corrections.rule, f.rule), opt(s.corrections.source, f.source), opt(s.corrections.status, f.status),
    opt(s.corrections.versionId, f.versionId), opt(s.corrections.runId, f.runId), opt(s.corrections.stepId, f.stepId), opt(s.corrections.parentId, f.parentId),
  ], desc(s.corrections.createdAt));
  const versionsT = table<s.ModelVersion, s.NewModelVersion, s.VersionFilter & { limit?: number }>(s.modelVersions, fillVersion,
    (f) => [opt(s.modelVersions.status, f.status)], asc(s.modelVersions.createdAt));
  const evals = table<s.Eval, s.NewEval, s.EvalFilter>(s.evals, fillEval, (f) => [opt(s.evals.versionId, f.versionId), opt(s.evals.lane, f.lane)], desc(s.evals.createdAt));

  let seeded: Promise<void> | null = null;
  const ensureSeed = () => (seeded ??= (async () => {
    const v1 = await versionsT.get('v1');
    if (!v1) await versionsT.insert(seedVersion());
  })().catch((e) => { seeded = null; throw e; }));

  const versions: Repo['versions'] = {
    insert: async (n) => { await ensureSeed(); return versionsT.insert(n); },
    update: async (id, p) => { await ensureSeed(); return versionsT.update(id, p); },
    get: async (id) => { await ensureSeed(); return versionsT.get(id); },
    list: async (f) => { await ensureSeed(); return versionsT.list(f); },
    async current() {
      await ensureSeed();
      const all = await versionsT.list();
      return all.filter((v) => v.promoted).pop() ?? all[0];
    },
    async promote(id) {
      await ensureSeed();
      const target = await versionsT.get(id); if (!target) return null;
      await db.update(s.modelVersions).set({ promoted: false });
      return versionsT.update(id, { promoted: true });
    },
  };
  return { kind: 'neon', runs, steps, corrections, versions, evals };
}

const g = globalThis as unknown as { __retryRepo?: Repo };

function makeRepo(): Repo {
  const url = process.env.DATABASE_URL;
  if (url) return createNeonRepo(url);
  return createMemoryRepo();
}

/** Singleton; stored on globalThis so Next dev hot reload keeps the in-memory data. */
export function getRepo(): Repo { return (g.__retryRepo ??= makeRepo()); }

/** Test helper: reset to a fresh in-memory repo. */
export function resetMemoryRepo(): Repo { g.__retryRepo = createMemoryRepo(); return g.__retryRepo; }

export const repo: Repo = new Proxy({} as Repo, { get: (_t, k) => getRepo()[k as keyof Repo] });

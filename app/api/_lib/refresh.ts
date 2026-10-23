// Version lifecycle shared by /api/refresh and /api/refresh/status.
import { nanoid } from 'nanoid';
import { repo, type ModelVersion } from '@/lib/db';
import { learnedFromCorrections, nextVersionLabel } from '@/lib/db/queries';
import { getMubit, mubitMode } from '@/lib/mubit';
import { cfg } from '@/lib/mubit/config';

export type RefreshPhase = 'collecting' | 'training' | 'evaluating' | 'promoted' | 'held_back';
export interface RefreshStatus { phase: RefreshPhase; progress: number; version?: ModelVersion; queued: number; needed: number; mode: 'real' | 'mock' }

export async function startRefresh(): Promise<{ jobId: string | null; mode: 'explicit' | 'automatic'; versionId: string }> {
  const mubit = getMubit();
  const r = await mubit.requestRefresh();
  if (mubitMode() === 'mock' && r.jobId) return { ...r, versionId: r.jobId }; // mock created the row itself
  // Real Mubit: track the version in our DB (mubitVersionId filled when Mubit reports it ready).
  const existing = (await repo.versions.list({ status: 'training' }))[0];
  if (existing) return { ...r, versionId: existing.id };
  const all = await repo.corrections.list();
  const label = await nextVersionLabel();
  const v = await repo.versions.insert({
    id: `ver_${label}_${nanoid(4)}`, label, baseModel: cfg().openBaseModel, examples: all.length, status: 'training',
    rules: learnedFromCorrections(all), jobId: r.jobId, createdAt: new Date(),
  });
  return { ...r, versionId: v.id };
}

async function queuedCount(): Promise<number> {
  return (await repo.corrections.list()).filter((c) => !c.versionId).length;
}

/** NOTE (Agent D): replace auto-promotion with held-out eval + gate (§13.4) → phases 'evaluating' / 'held_back'. */
export async function refreshStatus(jobId?: string | null): Promise<RefreshStatus> {
  const c = cfg();
  const mode = mubitMode();
  const needed = c.refreshMinExamples;
  const all = await repo.versions.list();
  let v = jobId ? all.find((x) => x.id === jobId || x.jobId === jobId) : undefined;
  if (!v) v = all.filter((x) => x.status === 'training').pop();
  const queued = await queuedCount();
  if (!v) return { phase: 'collecting', progress: Math.min(1, queued / needed), queued, needed, mode };

  if (v.status === 'training') {
    const info = await getMubit().refreshStatus(mode === 'mock' ? v.id : v.jobId ?? null);
    if (mode === 'real' && info?.status === 'ready') {
      v = (await repo.versions.update(v.id, { status: 'ready', readyAt: new Date(), mubitVersionId: info.versionId })) ?? v;
      for (const x of (await repo.corrections.list()).filter((y) => !y.versionId && new Date(y.createdAt ?? 0) <= new Date(v!.createdAt ?? 0))) {
        await repo.corrections.update(x.id, { status: 'trained', versionId: v.id });
      }
    } else if (mode === 'real' && info?.status === 'failed') {
      v = (await repo.versions.update(v.id, { status: 'failed' })) ?? v;
    } else {
      v = (await repo.versions.get(v.id)) ?? v;
    }
    if (v.status === 'training') {
      const elapsed = (Date.now() - new Date(v.createdAt ?? 0).getTime()) / 1000;
      const est = mode === 'mock' ? c.mockTrainSeconds : Number(process.env.MUBIT_EST_TRAIN_SECONDS ?? 120);
      return { phase: 'training', progress: info?.progress ?? Math.min(0.99, elapsed / Math.max(1, est)), version: v, queued, needed, mode };
    }
  }
  if (v.status === 'failed') return { phase: 'held_back', progress: 1, version: v, queued, needed, mode };
  if (v.heldBackReason) return { phase: 'held_back', progress: 1, version: v, queued, needed, mode };
  if (!v.promoted) v = (await repo.versions.promote(v.id)) ?? v;
  return { phase: 'promoted', progress: 1, version: v, queued, needed, mode };
}

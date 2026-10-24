'use client';
// Agent H: version history for the timeline rail, derived from the existing /api/versions route (no store additions).
import { useEffect, useState } from 'react';
import { useMission } from '@/lib/store/mission';

export interface VersionInfo {
  id: string; label: string; examples: number; promoted: boolean; status: string; heldBackReason: string | null;
  rules: string[]; readyAt?: string;
  metrics: null | { verifiedSuccess: number | null; bugRecall: number | null; violationsPerRun: number | null; rescuesPer10: number | null; p50LatencyMs: number | null; gate?: { pass: boolean; headline?: string; comparedTo?: string } };
}

export function useVersions(): VersionInfo[] {
  const label = useMission((s) => s.adapted.label);
  const k = useMission((s) => s.metricsKey);
  const phase = useMission((s) => s.training.phase);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  useEffect(() => {
    let dead = false;
    fetch('/api/versions').then((r) => r.json()).then((r) => { if (!dead && r?.ok && Array.isArray(r.data)) setVersions(r.data); }).catch(() => {});
    return () => { dead = true; };
  }, [label, k, phase]);
  return versions;
}

/** Rules this version knows that the previous ready version did not. */
export function learnedDiff(vs: VersionInfo[], i: number): string[] {
  const prev = vs.slice(0, i).reverse().find((v) => v.status === 'ready' && !v.heldBackReason);
  const before = new Set(prev?.rules ?? []);
  return (vs[i].rules ?? []).filter((r) => !before.has(r));
}

'use client';
// Mission Control state (plan §14). High-frequency visuals (particles, cursors) go through lib/store/bus.
import { create } from 'zustand';
import type { AgentAction, LaneId, StepResult, Verdict } from '@/lib/agent/types';
import type { BugId, RuleId } from '@/lib/shop/state';
import { BASE_LANES, DEFAULT_SEED } from './lanes';
import type { Pick } from './frames';

export type LaneStatus = 'idle' | 'running' | 'rescue' | 'done';
export type MissionMode = 'live' | 'replay';
export type TrainingPhase = 'collecting' | 'ready' | 'training' | 'evaluating' | 'promoted' | 'held_back';
export type Scope = 'heldout' | 'live';

export interface StepEntry {
  idx: number; action: AgentAction; label?: string; result?: StepResult;
  latencyMs: number; human?: boolean; stepId?: string;
}
export interface BugReport { evidence: string; page: string; layoutTag: string; seed: number; taskId: string; bugs: BugId[]; steps: string[] }
export interface LaneRuntime {
  status: LaneStatus; runId?: string; steps: StepEntry[]; thinking: boolean;
  verdict?: Verdict; verdictKey: number; latencies: number[]; costUsd: number; costKnown: boolean;
  promptChars: number; layoutTag?: string; bug?: BugReport; flash?: RuleId | null; error?: string; rescueQueued?: boolean;
}
export interface RescueState {
  lane: LaneId; stepId: string; badAction: AgentAction; badLabel?: string; autoRule?: RuleId;
  picked?: Pick; rule?: RuleId | 'other'; otherText: string; value: string;
  /** [G] set when the last pick was refused (it breaks a house rule / repeats the stuck move); overlay should show it. */
  rejected?: string;
}
export interface CorrectionView {
  id: string; lane: LaneId; rule?: RuleId | 'other'; ruleText?: string;
  bad: { action: AgentAction; label?: string }; good: { action: AgentAction; label?: string };
  augmented: number; status: 'queued' | 'sent' | 'trained' | 'failed'; landed: boolean; at: number;
  /** Agent E: 'scripted' = overnight solver backlog (never shown as human); undefined/'human' = a person. */
  source?: 'human' | 'scripted';
}
export interface ScoreRow {
  key: string; label: string; unit?: string; better: 'higher' | 'lower';
  values: Partial<Record<LaneId, number | null>>; prev?: Partial<Record<LaneId, number | null>>;
}
export interface CurvePoint { lane: LaneId; version: string; corrections: number; success: number }
export interface AdaptedVersion { versionId?: string; label: string; examples?: number; createdAt?: string }

const freshLane = (): LaneRuntime => ({ status: 'idle', steps: [], thinking: false, verdictKey: 0, latencies: [], costUsd: 0, costKnown: false, promptChars: 0 });

export interface MissionState {
  mode: MissionMode;
  health: { mubit: 'ok' | 'mock' | 'down' | 'unknown'; db: string; demoMode: boolean };
  seed: number; versionIndex: number; layoutTag: string; layoutFlash: number;
  taskId: string; bugs: BugId[]; iclOn: boolean; sound: boolean; running: boolean;
  frameEpoch: number; // bump to force iframe re-mount
  lanes: Record<LaneId, LaneRuntime>;
  calls: number;
  rescue: RescueState | null;
  corrections: CorrectionView[];
  counts: { rescues: number; examples: number; sinceVersion: number };
  training: { phase: TrainingPhase; progress: number; startedAt?: number; jobId?: string | null; reason?: string; trainSeconds?: number };
  adapted: AdaptedVersion; flipKey: number; prevAdaptedLabel?: string;
  scope: Scope; rows: ScoreRow[]; curve: CurvePoint[]; metricsKey: number;
  breakMenu: boolean; replayAt?: string;
  /** Agent E: recording's honestLabel (ReplayBanner must show it verbatim), title, current scene caption; Shift+R recorder on. */
  replayLabel?: string; replayTitle?: string; replayCaption?: string; recording?: boolean;

  set: (p: Partial<MissionState>) => void;
  patchLane: (lane: LaneId, p: Partial<LaneRuntime> | ((l: LaneRuntime) => Partial<LaneRuntime>)) => void;
  resetLanes: () => void;
  activeLanes: () => LaneId[];
}

export const useMission = create<MissionState>((set, get) => ({
  mode: 'live',
  health: { mubit: 'unknown', db: 'unknown', demoMode: false },
  seed: DEFAULT_SEED, versionIndex: 4, layoutTag: 'layout-v4', layoutFlash: 0,
  taskId: 'T2', bugs: [], iclOn: false, sound: false, running: false, frameEpoch: 0,
  lanes: { closed: freshLane(), base: freshLane(), adapted: freshLane(), icl: freshLane() },
  calls: 0,
  rescue: null,
  corrections: [],
  counts: { rescues: 0, examples: 0, sinceVersion: 0 },
  training: { phase: 'collecting', progress: 0 },
  adapted: { label: 'v4' }, flipKey: 0,
  scope: 'heldout', rows: [], curve: [], metricsKey: 0,
  breakMenu: false,

  set: (p) => set(p),
  patchLane: (lane, p) => set((s) => {
    const cur = s.lanes[lane];
    const next = typeof p === 'function' ? p(cur) : p;
    return { lanes: { ...s.lanes, [lane]: { ...cur, ...next } } };
  }),
  resetLanes: () => set({ lanes: { closed: freshLane(), base: freshLane(), adapted: freshLane(), icl: freshLane() }, rescue: null }),
  activeLanes: () => (get().iclOn ? [...BASE_LANES, 'icl'] : BASE_LANES),
}));

export function p50(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

// Debug/automation handle (screenshot scripts, /attract): window.__mission.getState()
if (typeof window !== "undefined") (window as unknown as { __mission?: typeof useMission }).__mission = useMission;

// plan §19 / §29 — recorded demo sessions (DEMO_MODE replay). Pure types; safe on client and server.
import type { AgentAction, LaneId, StepResult, Verdict } from '@/lib/agent/types';
import type { BugId, RuleId } from '@/lib/shop/state';

export type RefreshPhaseRec = 'collecting' | 'training' | 'evaluating' | 'promoted' | 'held_back';

/** Every event carries `at` = ms since the start of the recording (real or simulated timings, see Recording.timing). */
export type RecordingEvent =
  | { kind: 'scene'; at: number; sceneId: string; title: string; caption: string; taskId: string; goal: string;
      seed: number; versionIndex: number; bugs: BugId[]; layoutTag: string; lanes: { lane: LaneId; label: string; versionLabel: string }[] }
  | { kind: 'step'; at: number; sceneId: string; lane: LaneId; runId: string; stepIdx: number; action: AgentAction; result: StepResult;
      latencyMs: number; costUsd: number | null; promptChars: number; snapshot: string }
  | { kind: 'verdict'; at: number; sceneId: string; lane: LaneId; runId: string; verdict: Verdict; steps: number }
  | { kind: 'correction'; at: number; sceneId: string; lane: LaneId; rule: RuleId | 'BUG' | null; source: 'human' | 'scripted';
      badAction: AgentAction | null; goodAction: AgentAction; augmented: number; correctionId?: string }
  | { kind: 'version'; at: number; phase: RefreshPhaseRec; label: string; progress: number; examples?: number; headline?: string }
  | { kind: 'caption'; at: number; text: string };

export type RecordingEventKind = RecordingEvent['kind'];

export interface Recording {
  format: 'retry-recording@1';
  id: string;
  title: string;
  recordedAt: string;                 // ISO
  source: 'simulator' | 'live';       // simulator = scripts/record-demo.ts; live = Shift+R in Mission Control
  mubitMode: 'real' | 'mock';
  timing: 'real' | 'simulated';       // 'simulated' = model latencies reported by the (mock) client + fixed animation budget
  /** Always shown by the ReplayBanner, e.g. "Replay of simulator run recorded Sat 21:40 · simulated timings". */
  honestLabel: string;
  durationMs: number;
  events: RecordingEvent[];           // sorted by `at`
}

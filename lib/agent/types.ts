// CONTRACT (plan.md §5.2) — frozen.
import type { RuleId } from '@/lib/shop/state';

export type ActionType = 'click' | 'type' | 'select' | 'scroll' | 'done' | 'report_bug';
export interface AgentAction { type: ActionType; target?: string; value?: string; reason: string }
export type StepResult = 'ok' | 'no_effect' | 'invalid' | 'error';
export type LaneId = 'closed' | 'base' | 'adapted' | 'icl';

export interface ModelRef { kind: 'closed' | 'open'; model: string; versionId?: string; label: string }

export interface HistoryItem { action: AgentAction; result: StepResult }

export interface StepRequest {
  runId: string; lane: LaneId; taskId: string; goal: string;
  snapshot: string; history: HistoryItem[]; modelRef: ModelRef; stepIdx: number;
}
export interface StepResponse {
  stepId: string; action: AgentAction; callId: string | null;
  latencyMs: number; usage: { in: number; out: number }; costUsd: number | null;
  raw: string; parseOk: boolean; promptChars: number;
}

export type RunStatus = 'running' | 'passed' | 'failed' | 'bug_reported' | 'stuck' | 'violation';
export interface Verdict {
  status: RunStatus; correct: boolean;   // correct = matches oracle ground truth
  reason: string; violations: RuleId[];
}

export interface Task { id: string; goal: string; skus: { sku: string; qty: number }[];
  wantsCoupon: boolean; wantsCollect: boolean; rulesExercised: RuleId[] }

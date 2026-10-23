// zod schemas mirroring the frozen contracts (lib/agent/types.ts).
import { z } from 'zod';

export const LaneIdS = z.enum(['closed', 'base', 'adapted', 'icl']);
export const RuleIdS = z.enum(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);
export const AgentActionS = z.object({
  type: z.enum(['click', 'type', 'select', 'scroll', 'done', 'report_bug']),
  target: z.string().optional(), value: z.string().optional(), reason: z.string().default(''),
});
export const StepResultS = z.enum(['ok', 'no_effect', 'invalid', 'error']);
export const ModelRefS = z.object({ kind: z.enum(['closed', 'open']), model: z.string().min(1), versionId: z.string().optional(), label: z.string().default('') });
export const HistoryItemS = z.object({ action: AgentActionS, result: StepResultS });
/** ShopState is validated structurally by the engine; accept any object here. */
export const ShopStateS = z.record(z.string(), z.unknown());

export const StepRequestS = z.object({
  runId: z.string().min(1), lane: LaneIdS, taskId: z.string().min(1), goal: z.string().min(1),
  snapshot: z.string().min(1), history: z.array(HistoryItemS).max(64), modelRef: ModelRefS, stepIdx: z.number().int().min(0),
  // optional extras (not in the frozen contract): stored for audit + augmentation
  state: ShopStateS.optional(), seed: z.number().int().optional(), bugs: z.array(z.string()).optional(),
});

export const FinishS = z.object({
  runId: z.string().min(1), lane: LaneIdS, taskId: z.string().min(1),
  finalAction: AgentActionS.nullable(),
  finalStateDigest: z.union([ShopStateS, z.string()]).optional(),
  finalState: ShopStateS.optional(),
  stuck: z.boolean().optional(),
});

export const CorrectionPostS = z.object({ stepId: z.string().min(1), goodAction: AgentActionS, rule: z.union([RuleIdS, z.literal('BUG'), z.literal('Other')]).optional(), note: z.string().max(500).optional() });
export const CorrectionQueryS = z.object({ limit: z.coerce.number().int().min(1).max(1000).optional(), rule: z.string().optional(), source: z.enum(['human', 'augmented']).optional(), status: z.string().optional() });

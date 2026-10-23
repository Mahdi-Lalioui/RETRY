// Send stored corrections to Mubit as feedback (+ optional memory-plane step outcomes).
import { getMubit } from '@/lib/mubit';
import { repo, type Correction } from '@/lib/db';
import { memoryFallbackEnabled, recordStepOutcome } from '@/lib/mubit/memory-fallback';
import { formatAction } from '@/lib/agent/prompt';

export async function sendCorrection(c: Correction, callId: string | null): Promise<void> {
  const mubit = getMubit();
  let feedbackId: string | null = null; let status = 'sent';
  try {
    const r = await mubit.submitFeedback({
      callId: c.source === 'human' ? callId : null, input: c.messages, preferredOutput: JSON.stringify(c.goodAction),
      badOutput: c.badAction ? JSON.stringify(c.badAction) : undefined, label: 'correction', score: 0,
      tags: [c.rule ?? 'untagged', c.source, ...(c.parentId ? [`parent:${c.parentId}`] : [])],
    });
    feedbackId = r.feedbackId;
  } catch (e) {
    status = 'failed';
    console.error(`[mubit] feedback failed for ${c.id}: ${(e as Error).message}`);
  }
  await repo.corrections.update(c.id, { status, mubitFeedbackId: feedbackId });
  if (memoryFallbackEnabled() && c.source === 'human' && c.runId) {
    await recordStepOutcome({
      runId: c.runId, stepId: c.stepId ?? c.id, stepName: 'retry-next-action', outcome: 'failure', signal: -1,
      rationale: c.badAction ? `Agent chose ${formatAction(c.badAction)}` : 'Agent got stuck',
      directiveHint: `${c.rule ? `${c.rule}: ` : ''}should have done ${formatAction(c.goodAction)} — ${c.goodAction.reason}`,
      metadata: { rule: c.rule, correctionId: c.id, semKey: c.semKey },
    });
  }
}

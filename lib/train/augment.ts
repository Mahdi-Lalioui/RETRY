// OWNED BY AGENT D — minimal placeholder hook created by Agent B. Replace with §12.1 semKey remapping
// (8 augmented examples per human rescue). Keep the signature: /api/corrections calls it.
import type { Correction, NewCorrection, Step } from '@/lib/db/schema';

/**
 * Given a stored human correction and the step it corrects (step.state = ShopState before the action),
 * return augmented correction rows (source:'augmented', parentId: human.id). They are inserted and sent
 * to Mubit by the caller.
 */
export async function augmentCorrection(human: Correction, step: Step | null): Promise<NewCorrection[]> {
  void human; void step;
  return [];
}

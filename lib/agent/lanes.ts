// plan §14.1 colours; lane → ModelRef. Adapted lane's versionId is filled in server-side from repo.versions.current()
// (see resolveModelRef in policy.ts) or passed by the client from /api/versions.
import type { LaneId, ModelRef } from './types';

const closedModel = () => process.env.CLOSED_MODEL || process.env.NEXT_PUBLIC_CLOSED_MODEL || 'gpt-4o-mini';
const openModel = () => process.env.OPEN_BASE_MODEL || process.env.NEXT_PUBLIC_OPEN_BASE_MODEL || 'open-base';

export const LANES: Record<LaneId, { id: LaneId; label: string; color: string; modelRef: () => ModelRef }> = {
  closed: { id: 'closed', label: 'GPT · closed', color: 'var(--closed)', modelRef: () => ({ kind: 'closed', model: `closed:${closedModel()}`, label: 'GPT · closed' }) },
  base: { id: 'base', label: 'Base · open v1', color: 'var(--base)', modelRef: () => ({ kind: 'open', model: `open:${openModel()}`, label: 'Base · open v1' }) },
  adapted: { id: 'adapted', label: 'RETRY · open', color: 'var(--learn)', modelRef: () => ({ kind: 'open', model: `open:${openModel()}`, label: 'RETRY · open' }) },
  icl: { id: 'icl', label: 'ICL · open v1', color: 'var(--icl)', modelRef: () => ({ kind: 'open', model: `open:${openModel()}`, label: 'ICL · open v1 + examples' }) },
};

export const LANE_HEX: Record<LaneId, string> = { closed: '#94A3B8', base: '#A78BFA', adapted: '#22D3EE', icl: '#F472B6' };
export const LANE_IDS: LaneId[] = ['closed', 'base', 'adapted', 'icl'];

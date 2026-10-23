// Visual identity of each lane on Mission Control (labels/colours). Model refs come from lib/agent/lanes.
import type { LaneId } from '@/lib/agent/types';

export interface LaneTheme { id: LaneId; name: string; kind: string; color: string; hex: string; caption: string }

export const LANE_THEME: Record<LaneId, LaneTheme> = {
  closed: { id: 'closed', name: 'GPT', kind: 'closed', color: 'var(--color-closed)', hex: '#94A3B8', caption: 'Closed frontier model' },
  base: { id: 'base', name: 'Base', kind: 'open', color: 'var(--color-base)', hex: '#A78BFA', caption: 'Open model, no corrections' },
  adapted: { id: 'adapted', name: 'RETRY', kind: 'open', color: 'var(--color-learn)', hex: '#22D3EE', caption: 'Open model + Mubit update' },
  icl: { id: 'icl', name: 'ICL', kind: 'open', color: 'var(--color-icl)', hex: '#F472B6', caption: 'Corrections stuffed in prompt' },
};

export const BASE_LANES: LaneId[] = ['closed', 'base', 'adapted'];
export const REFRESH_MIN_EXAMPLES = Number(process.env.NEXT_PUBLIC_REFRESH_MIN_EXAMPLES ?? 40) || 40;
export const MAX_STEPS = Number(process.env.NEXT_PUBLIC_MAX_STEPS ?? 16) || 16;
export const DEFAULT_SEED = Number(process.env.NEXT_PUBLIC_DEFAULT_SEED ?? 9001) || 9001;

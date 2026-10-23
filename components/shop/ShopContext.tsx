'use client';
import { cloneElement, createContext, isValidElement, useContext, type ReactElement } from 'react';
import type { AgentElement, ShopState } from '@/lib/shop/state';

export interface ShopCtx {
  state: ShopState;
  els: AgentElement[];
  bySem: Map<string, AgentElement>;
  dispatch: (semKey: string, value?: string) => void;
  highlight: boolean;
}

export const ShopContext = createContext<ShopCtx | null>(null);

export function useShop(): ShopCtx {
  const c = useContext(ShopContext);
  if (!c) throw new Error('useShop outside ShopShell');
  return c;
}

/** Elements of a region, in engine (render) order. */
export function useRegion(region: string, roles?: AgentElement['role'][]): AgentElement[] {
  const { els } = useShop();
  return els.filter((e) => e.region === region && (!roles || roles.includes(e.role)));
}

/**
 * Wraps one interactive element: sets data-agent-id (engine id for this semKey), data-sem-key,
 * aria-label and the rescue chip text on the child element itself (so rects are real).
 */
export function AgentEl({ semKey, children }: { semKey: string; children: ReactElement }) {
  const { bySem } = useShop();
  const el = bySem.get(semKey);
  if (!isValidElement(children)) return children;
  if (!el) return children;
  return cloneElement(children as ReactElement<Record<string, unknown>>, {
    'data-agent-id': el.id,
    'data-sem-key': semKey,
    'data-chip': `${el.id} · ${el.role} · ${el.label}`,
    'aria-label': el.label,
  });
}

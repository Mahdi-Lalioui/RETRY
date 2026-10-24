// Compact deterministic text snapshot (plan.md §9.1). Never includes semKeys.
import type { AgentElement, ShopState } from './state';
import { elements, totals } from './engine';
import { formatPence } from './catalog';

const q = (s: string) => `"${s.replace(/"/g, "'").replace(/\s+/g, ' ')}"`;

export function renderElement(e: AgentElement): string {
  let s = `${e.id} ${e.role} ${q(e.label)}`;
  if (e.role === 'textbox' || e.role === 'select') s += ` value=${q(e.value ?? '')}`;
  if (e.role === 'select' && e.options) s += ` options=${e.options.join('/')}`;
  if (e.role === 'radio' || e.role === 'checkbox') s += ` checked=${e.checked ? 'true' : 'false'}`;
  if (e.disabled) s += ' disabled';
  return s;
}

export function renderSnapshot(state: ShopState): string {
  const t = totals(state);
  const lines = [`PAGE ${state.page} | LAYOUT ${state.layout.layoutTag} | CART ${t.items} item${t.items === 1 ? '' : 's'} ${formatPence(t.merchandise + t.extras)}`];
  if (state.openModals.length) lines.push(`DIALOG OPEN: ${state.openModals[0]} — answer it first; the page behind it is blocked`);
  let region: string | null = null;
  let parts: string[] = [];
  const flush = () => { if (region !== null) lines.push(`[${region}] ${parts.join(' | ')}`); };
  for (const e of elements(state)) {
    if (e.region !== region) { flush(); region = e.region; parts = []; }
    parts.push(renderElement(e));
  }
  flush();
  return lines.join('\n');
}

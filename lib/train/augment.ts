// plan §12.1 — one rescue → 8 augmented examples: "the same human decision re-rendered on different layouts".
// For each of 8 training seeds (pool 1–200, never the rescue's own seed) we rebuild an EQUIVALENT state under that
// seed's layout (same page, cart, open modals, inputs, bugs), find the element with the same semKey (new id + label),
// remap the ids in the history too, and build the exact prompt the policy would build.
import type { Correction, NewCorrection, Step, WithOptionalId } from '@/lib/db/schema';
import type { AgentAction, HistoryItem } from '@/lib/agent/types';
import type { ShopState } from '@/lib/shop/state';
import { initialState, findBySemKey, resolveTarget, type ShopStateX } from '@/lib/shop/engine';
import { renderSnapshot } from '@/lib/shop/snapshot';
import { buildMessages } from '@/lib/agent/prompt';
import { repo } from '@/lib/db';
import { TRAINING_SEEDS } from '@/lib/eval/suite';

export const AUGMENT_PER_RESCUE = 8;

/** A history entry with the state it was taken in (needed to remap its target id by semKey). */
export interface HistoryWithState extends HistoryItem { state?: ShopState | null }

export interface AugmentInput {
  goal: string;
  state: ShopState;                 // state BEFORE the corrected action
  goodAction: AgentAction;
  history: HistoryWithState[];
  excludeSeeds?: number[];
  count?: number;
  salt?: string;                    // deterministic seed order
}

export interface AugmentedExample {
  seed: number; state: ShopState; snapshot: string; messages: NewCorrection['messages'];
  goodAction: AgentAction; semKey: string | null; preferredOutput: string; history: HistoryItem[];
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; // avalanche
  return h >>> 0;
}

/** Deterministic permutation of the training pool for this correction. */
export function candidateSeeds(salt: string, exclude: number[] = []): number[] {
  const pool: number[] = [];
  for (let s = TRAINING_SEEDS.min; s <= TRAINING_SEEDS.max; s++) if (!exclude.includes(s)) pool.push(s);
  return pool.map((s) => ({ s, k: hash(`${salt}:${s}`) })).sort((a, b) => a.k - b.k).map((x) => x.s);
}

/** Re-render `src` under another seed's layout: same page, cart, modals, inputs, bugs, violations. */
export function equivalentState(src: ShopState, seed: number): ShopState {
  const fresh = initialState(seed, versionIndexOf(src), src.bugs) as ShopStateX;
  const s = src as ShopStateX;
  return {
    ...fresh,
    page: s.page, currentSku: s.currentSku, cart: s.cart.map((l) => ({ ...l })), openModals: [...s.openModals],
    cookiesChoice: s.cookiesChoice, newsletterSubscribed: s.newsletterSubscribed, shipping: s.shipping,
    couponInput: s.couponInput, couponApplied: s.couponApplied, cardInput: s.cardInput, usedSavedCard: s.usedSavedCard,
    orderId: s.orderId, totalPence: s.totalPence, errorMessage: s.errorMessage, violations: [...s.violations],
    ui: s.ui ? { ...s.ui } : fresh.ui,
  } as ShopStateX;
}

function versionIndexOf(s: ShopState): number {
  const m = s.layout.layoutTag.match(/v(\d+)/);
  return m ? Number(m[1]) : 1;
}

/** The new layout must be able to show the same situation (same modals; same newsletter trap on the cart). */
function compatible(src: ShopState, dst: ShopState): boolean {
  for (const m of src.openModals) {
    if (m === 'giftwrap' ? !dst.layout.extraRules.includes('R7') : !dst.layout.modalsEnabled.includes(m)) return false;
  }
  if (src.page === 'cart') {
    const nl = (x: ShopState) => x.layout.modalsEnabled.includes('newsletter') && !x.newsletterSubscribed;
    if (nl(src) !== nl(dst)) return false;
    if (nl(src) && src.layout.decoyContinue !== dst.layout.decoyContinue) return false;
  }
  return true;
}

function remapAction(a: AgentAction, from: ShopState | null | undefined, to: ShopState | null): AgentAction | null {
  if (!a.target) return { ...a };
  if (!from || !to) return null;
  const semKey = resolveTarget(from, a.target);
  if (!semKey) return null;
  const id = findBySemKey(to, semKey);
  return id ? { ...a, target: id } : null;
}

/** Pure core (no DB): build up to `count` augmented examples. */
export function augmentExamples(inp: AugmentInput): AugmentedExample[] {
  const count = inp.count ?? AUGMENT_PER_RESCUE;
  const semKey = inp.goodAction.target ? resolveTarget(inp.state, inp.goodAction.target) ?? null : null;
  if (inp.goodAction.target && !semKey) return [];
  const exclude = [inp.state.layout.seed, ...(inp.excludeSeeds ?? [])];
  const out: AugmentedExample[] = [];
  for (const seed of candidateSeeds(inp.salt ?? `${inp.state.layout.seed}:${semKey}:${inp.goal}`, exclude)) {
    if (out.length >= count) break;
    const state = equivalentState(inp.state, seed);
    if (!compatible(inp.state, state)) continue;
    let goodAction: AgentAction = { ...inp.goodAction };
    if (semKey) {
      const id = findBySemKey(state, semKey);
      if (!id) continue;
      goodAction = { ...goodAction, target: id };
    }
    // remap the history: each past action's id → semKey (in its own state) → id in the equivalent past state
    const history: HistoryItem[] = [];
    let okHist = true;
    for (const h of inp.history) {
      const past = h.state ? equivalentState(h.state, seed) : null;
      const a = remapAction(h.action, h.state, past);
      if (!a) { okHist = false; break; }
      history.push({ action: a, result: h.result });
    }
    if (!okHist) continue;
    const snapshot = renderSnapshot(state);
    const messages = buildMessages({ goal: inp.goal, history, snapshot, lane: 'adapted' });
    out.push({ seed, state, snapshot, messages, goodAction, semKey, preferredOutput: JSON.stringify(goodAction), history });
  }
  return out;
}

/** Load the history (with per-step states) leading up to `step` from the DB. */
async function historyFor(step: Step): Promise<HistoryWithState[]> {
  const prev = (await repo.steps.list({ runId: step.runId })).filter((s) => s.idx < step.idx).sort((a, b) => a.idx - b.idx);
  return prev.map((s) => ({ action: s.action, result: (s.result ?? 'ok') as HistoryItem['result'], state: s.state as ShopState | null }));
}

/**
 * Given a stored correction (human or scripted) and the step it corrects (step.state = ShopState before the action),
 * return augmented correction rows (source:'augmented', parentId). The caller inserts them and sends them to Mubit.
 * `ctx` lets callers without stored steps (scripts/backlog) pass state + history directly.
 */
export async function augmentCorrection(
  human: Correction, step: Step | null, ctx?: { state: ShopState; history: HistoryWithState[] },
): Promise<WithOptionalId<NewCorrection>[]> {
  const state = ctx?.state ?? (step?.state as ShopState | null);
  if (!state) return [];
  const history = ctx?.history ?? (step ? await historyFor(step) : []);
  const ex = augmentExamples({ goal: human.goal, state, goodAction: human.goodAction, history, salt: human.id });
  return ex.map((e) => ({
    source: 'augmented', parentId: human.id, runId: human.runId, stepId: human.stepId, rule: human.rule, goal: human.goal,
    messages: e.messages, badAction: null, goodAction: e.goodAction, semKey: e.semKey, seed: e.seed, status: 'queued', lane: human.lane,
  }));
}

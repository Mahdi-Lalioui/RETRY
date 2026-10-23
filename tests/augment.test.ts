import { describe, it, expect } from 'vitest';
import { act, applyAction, findBySemKey, initialState, resolveTarget } from '@/lib/shop/engine';
import { renderSnapshot } from '@/lib/shop/snapshot';
import { augmentExamples, augmentCorrection, equivalentState } from '@/lib/train/augment';
import type { ShopState } from '@/lib/shop/state';
import type { Correction } from '@/lib/db/schema';
import { getTask } from '@/lib/shop/tasks';

/** Find a training seed whose layout has cookies + upsell, and walk to the upsell modal. */
function upsellState(): { seed: number; before: ShopState[]; state: ShopState } {
  for (let seed = 1; seed <= 200; seed++) {
    let s = initialState(seed, 1);
    if (!s.layout.modalsEnabled.includes('upsell') || !s.layout.modalsEnabled.includes('cookies')) continue;
    const s0 = s;
    s = applyAction(s, 'cookies.essential').state;
    const s1 = s;
    s = applyAction(s, 'grid.add:aurora-lamp').state;
    if (s.openModals[0] !== 'upsell') continue;
    return { seed, before: [s0, s1], state: s };
  }
  throw new Error('no seed');
}

describe('augmentation (§12.1)', () => {
  it('produces 8 examples on other training seeds with the same semKey remapped', () => {
    const { seed, before, state } = upsellState();
    const good = { type: 'click' as const, target: findBySemKey(state, 'upsell.decline')!, reason: 'House policy: decline protection' };
    const history = [
      { action: { type: 'click' as const, target: findBySemKey(before[0], 'cookies.essential')!, reason: '' }, result: 'ok' as const, state: before[0] },
      { action: { type: 'click' as const, target: findBySemKey(before[1], 'grid.add:aurora-lamp')!, reason: '' }, result: 'ok' as const, state: before[1] },
    ];
    const ex = augmentExamples({ goal: getTask('T1').goal, state, goodAction: good, history });
    expect(ex).toHaveLength(8);
    const ids = new Set<string>();
    for (const e of ex) {
      expect(e.seed).not.toBe(seed);
      expect(e.seed).toBeGreaterThanOrEqual(1); expect(e.seed).toBeLessThanOrEqual(200);
      // same situation
      expect(e.state.page).toBe(state.page); expect(e.state.cart).toEqual(state.cart); expect(e.state.openModals).toEqual(state.openModals);
      // preferred target exists in the NEW snapshot and is the same semantic element
      expect(resolveTarget(e.state, e.goodAction.target!)).toBe('upsell.decline');
      expect(e.snapshot).toContain(`${e.goodAction.target} button`);
      expect(JSON.parse(e.preferredOutput)).toEqual(e.goodAction);
      // prompt is the exact policy prompt with the new snapshot
      expect(e.messages[1].content).toContain(e.snapshot);
      expect(e.messages[1].content).toContain('GOAL: Buy one Aurora Lamp');
      // history ids remapped by semKey in the equivalent past states
      const past1 = equivalentState(before[1], e.seed);
      expect(resolveTarget(past1, e.history[1].action.target!)).toBe('grid.add:aurora-lamp');
      expect(e.messages[1].content).toContain(`2. click ${e.history[1].action.target} → ok`);
      ids.add(`${e.goodAction.target}|${e.history[1].action.target}`);
      expect(e.snapshot).not.toBe(renderSnapshot(state));
    }
    expect(ids.size).toBeGreaterThan(1); // different layouts → different ids
  });

  it('handles typed values and report_bug corrections', () => {
    const task = getTask('T2');
    let s = initialState(42, 1, ['total_nan']);
    s = { ...s, openModals: [], page: 'checkout', cart: [{ sku: 'ember-mug', qty: 2, protection: false, giftwrap: false }], shipping: 'collect' };
    const typed = augmentExamples({ goal: task.goal, state: s, goodAction: { type: 'type', target: findBySemKey(s, 'checkout.coupon.input')!, value: 'NIGHTSHIFT', reason: '' }, history: [] });
    expect(typed).toHaveLength(8);
    for (const e of typed) {
      expect(resolveTarget(e.state, e.goodAction.target!)).toBe('checkout.coupon.input');
      expect(e.goodAction.value).toBe('NIGHTSHIFT');
      expect(act(e.state, e.goodAction).result).toBe('ok');
    }
    const bug = augmentExamples({ goal: task.goal, state: { ...s, couponApplied: 'NIGHTSHIFT' }, goodAction: { type: 'report_bug', reason: 'Total shows £NaN' }, history: [] });
    expect(bug).toHaveLength(8);
    for (const e of bug) { expect(e.goodAction.target).toBeUndefined(); expect(e.snapshot).toContain('£NaN'); }
  });

  it('augmentCorrection returns rows labelled augmented with parentId', async () => {
    const { state } = upsellState();
    const human = { id: 'cor_h', goal: getTask('T1').goal, goodAction: { type: 'click', target: findBySemKey(state, 'upsell.decline')!, reason: '' }, rule: 'R1', runId: null, stepId: 'step_1', lane: 'base' } as unknown as Correction;
    const rows = await augmentCorrection(human, null, { state, history: [] });
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.source === 'augmented' && r.parentId === 'cor_h' && r.rule === 'R1' && r.semKey === 'upsell.decline')).toBe(true);
  });
});

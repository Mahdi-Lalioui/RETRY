import { describe, expect, it } from 'vitest';
import seedrandom from 'seedrandom';
import { act, applyAction, elements, findBySemKey, initialState, resolveTarget } from '@/lib/shop/engine';
import { makeLayout } from '@/lib/shop/layout';
import { TASKS, getTask } from '@/lib/shop/tasks';
import { CATALOG } from '@/lib/shop/catalog';
import { RULES } from '@/lib/shop/rules';
import { solveStep } from '@/lib/shop/solver';
import { judge } from '@/lib/shop/oracle';
import type { ShopState } from '@/lib/shop/state';
import type { AgentAction, Task } from '@/lib/agent/types';

export function runSolver(task: Task, state: ShopState, max = 40): { state: ShopState; last: AgentAction } {
  let s = state;
  for (let i = 0; i < max; i++) {
    const a = solveStep(task, s);
    if (a.type === 'done' || a.type === 'report_bug') return { state: s, last: a };
    const r = act(s, a);
    expect(r.result, `${task.id} step ${i} ${JSON.stringify(a)}`).toBe('ok');
    s = r.state;
  }
  throw new Error(`solver did not finish ${task.id}`);
}

const rng = seedrandom('tests');
const SEEDS = Array.from({ length: 5 }, () => 1 + Math.floor(rng() * 200));

describe('catalog/tasks/rules', () => {
  it('has 6 products, 12 tasks, 7 rules', () => {
    expect(CATALOG).toHaveLength(6);
    expect(TASKS.map((t) => t.id)).toEqual(Array.from({ length: 12 }, (_, i) => `T${i + 1}`));
    expect(Object.keys(RULES)).toHaveLength(7);
    expect(getTask('T8').skus).toEqual([{ sku: 'drift-hoodie', qty: 1 }]);
  });
});

describe('layout', () => {
  it('is deterministic per seed and varies across seeds', () => {
    expect(makeLayout(42, 1)).toEqual(makeLayout(42, 1));
    const tags = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(makeLayout(i + 1, 1).productOrder)));
    expect(tags.size).toBeGreaterThan(5);
  });
  it('reveals R7 from version 6', () => {
    expect(makeLayout(3, 5).extraRules).toEqual([]);
    expect(makeLayout(3, 6).extraRules).toEqual(['R7']);
  });
});

describe('engine', () => {
  it('ids are e1..eN and map both ways', () => {
    const s = initialState(42, 1);
    const els = elements(s);
    els.forEach((e, i) => {
      expect(e.id).toBe(`e${i + 1}`);
      expect(resolveTarget(s, e.id)).toBe(e.semKey);
      expect(findBySemKey(s, e.semKey)).toBe(e.id);
    });
  });
  it('invalid target → invalid', () => {
    expect(act(initialState(1, 1), { type: 'click', target: 'e999', reason: '' }).result).toBe('invalid');
  });
});

describe('every task is completable by the solver', () => {
  for (const task of TASKS) {
    for (const seed of SEEDS) {
      for (const v of [1, 6]) {
        it(`${task.id} seed ${seed} v${v}`, () => {
          const { state, last } = runSolver(task, initialState(seed, v));
          expect(last.type).toBe('done');
          expect(state.violations).toEqual([]);
          expect(judge(task, state, last).status).toBe('passed');
        });
      }
    }
  }
});

function findSeed(pred: (s: ShopState) => boolean): number {
  for (let seed = 1; seed < 500; seed++) if (pred(initialState(seed, 6))) return seed;
  throw new Error('no seed');
}
function step(s: ShopState, semKey: string, value?: string): ShopState {
  const r = applyAction(s, semKey, value);
  expect(r.effect, semKey).toBe('ok');
  return r.state;
}
/** Drive the solver until a predicate holds. */
function until(task: Task, s: ShopState, pred: (s: ShopState) => boolean): ShopState {
  for (let i = 0; i < 40 && !pred(s); i++) s = act(s, solveStep(task, s)).state;
  expect(pred(s)).toBe(true);
  return s;
}

describe('rule violations are recorded', () => {
  const T1 = getTask('T1');
  const full = (l: ShopState['layout']) => l.modalsEnabled.includes('cookies') && l.modalsEnabled.includes('upsell') && l.modalsEnabled.includes('newsletter') && l.decoyContinue;
  const seed = findSeed((s) => full(s.layout));

  it('R5 cookies.all', () => {
    expect(step(initialState(seed, 6), 'cookies.all').violations).toEqual(['R5']);
  });
  it('R1 upsell.accept and R7 giftwrap.accept', () => {
    let s = step(initialState(seed, 6), 'cookies.essential');
    s = step(s, 'grid.add:aurora-lamp');
    expect(s.openModals[0]).toBe('upsell');
    s = step(s, 'upsell.accept');
    expect(s.violations).toEqual(['R1']);
    expect(s.openModals[0]).toBe('giftwrap');
    s = step(s, 'giftwrap.accept');
    expect(s.violations).toEqual(['R1', 'R7']);
    expect(s.cart[0]).toMatchObject({ protection: true, giftwrap: true });
  });
  it('R6 newsletter continue subscribes and navigates home', () => {
    let s = until(T1, initialState(seed, 6), (x) => x.page === 'cart');
    s = step(s, 'newsletter.continue');
    expect(s.violations).toEqual(['R6']);
    expect(s.page).toBe('home');
    expect(s.newsletterSubscribed).toBe(true);
  });
  it('R4 saved card succeeds but records R4', () => {
    let s = until(T1, initialState(seed, 6), (x) => x.page === 'checkout' && x.shipping === 'collect');
    s = step(s, 'checkout.pay.saved');
    expect(s.page).toBe('confirmation');
    expect(s.violations).toEqual(['R4']);
    expect(judge(T1, s, { type: 'done', reason: '' }).status).toBe('violation');
  });
  it('R3 wrong shipping', () => {
    let s = until(T1, initialState(seed, 6), (x) => x.page === 'checkout');
    s = step(s, 'checkout.ship.express');
    s = step(s, 'checkout.card.input', '4242424242424242');
    s = step(s, 'checkout.pay');
    expect(s.violations).toContain('R3');
  });
  it('R2 wrong coupon', () => {
    let s = until(getTask('T2'), initialState(seed, 6), (x) => x.page === 'checkout');
    s = step(s, 'checkout.coupon.input', 'SAVE10');
    s = step(s, 'checkout.coupon.apply');
    expect(s.violations).toEqual(['R2']);
    expect(elements(s).some((e) => e.label === 'Invalid code')).toBe(true);
  });
  it('NIGHTSHIFT gives 10% off', () => {
    let s = until(getTask('T6'), initialState(seed, 6), (x) => x.couponApplied === 'NIGHTSHIFT');
    expect(elements(s).find((e) => e.semKey === 'summary.discount')?.label).toBe('Discount −£3.50');
    s = runSolver(getTask('T6'), s).state;
    expect(s.totalPence).toBe(3500 - 350);
  });
  it('modal blocks the page', () => {
    const s = initialState(seed, 6);
    expect(applyAction(s, 'header.home').effect).toBe('no_effect');
  });
  it('product page qty select works', () => {
    let s = step(initialState(seed, 1), 'cookies.essential');
    s = step(s, 'grid.open:ember-mug');
    s = step(s, 'product.qty', '3');
    s = step(s, 'product.add');
    expect(s.cart).toEqual([{ sku: 'ember-mug', qty: 3, protection: false, giftwrap: false }]);
  });
});

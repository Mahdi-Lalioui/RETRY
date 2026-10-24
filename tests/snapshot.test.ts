import { describe, expect, it } from 'vitest';
import { act, elements, initialState } from '@/lib/shop/engine';
import { renderSnapshot } from '@/lib/shop/snapshot';
import { solveStep } from '@/lib/shop/solver';
import { TASKS } from '@/lib/shop/tasks';
import type { ShopState } from '@/lib/shop/state';

function trajectory(seed: number, taskIdx: number): ShopState[] {
  const task = TASKS[taskIdx];
  let s = initialState(seed, 6);
  const out = [s];
  for (let i = 0; i < 30; i++) {
    const a = solveStep(task, s);
    if (a.type === 'done' || a.type === 'report_bug') break;
    s = act(s, a).state;
    out.push(s);
  }
  return out;
}

describe('snapshot', () => {
  it('same seed → identical snapshot', () => {
    expect(renderSnapshot(initialState(42, 1))).toBe(renderSnapshot(initialState(42, 1)));
    const a = trajectory(77, 1).map(renderSnapshot);
    const b = trajectory(77, 1).map(renderSnapshot);
    expect(a).toEqual(b);
  });
  it('has the §9.1 header and region lines', () => {
    const snap = renderSnapshot(initialState(42, 1));
    expect(snap.split('\n')[0]).toMatch(/^PAGE home \| LAYOUT layout-v1 \| CART 0 items £0\.00$/);
    for (const line of snap.split('\n').slice(1).filter((l) => !l.startsWith('DIALOG OPEN'))) expect(line).toMatch(/^\[[^\]]+\] e\d+ /);
  });
  it('never contains semKeys', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const s of trajectory(seed, seed % 12)) {
        const snap = renderSnapshot(s);
        for (const e of elements(s)) {
          if (e.semKey.includes('.') ) expect(snap).not.toContain(e.semKey);
        }
        expect(snap).not.toMatch(/\b(grid|cart|checkout|upsell|cookies|giftwrap|newsletter|product|summary)\.[a-z]/);
      }
    }
  });
  it('stays compact', () => {
    for (const s of trajectory(5, 9)) expect(renderSnapshot(s).length).toBeLessThan(4000);
  });
});

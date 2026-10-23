import { describe, expect, it } from 'vitest';
import { act, initialState } from '@/lib/shop/engine';
import { solveStep } from '@/lib/shop/solver';
import { judge } from '@/lib/shop/oracle';
import { getTask, TASKS } from '@/lib/shop/tasks';
import { BUG_IDS } from '@/lib/shop/bugs';
import type { BugId, ShopState } from '@/lib/shop/state';
import type { AgentAction, Task } from '@/lib/agent/types';

function run(task: Task, s: ShopState): { state: ShopState; last: AgentAction } {
  for (let i = 0; i < 40; i++) {
    const a = solveStep(task, s);
    if (a.type === 'done' || a.type === 'report_bug') return { state: s, last: a };
    s = act(s, a).state;
  }
  throw new Error('no finish');
}
const done: AgentAction = { type: 'done', reason: 'x' };
const report: AgentAction = { type: 'report_bug', reason: 'x' };

describe('oracle with bugs', () => {
  const tasksFor = (b: BugId) => (b === 'coupon_500' ? TASKS.filter((t) => t.wantsCoupon) : TASKS);
  for (const bug of BUG_IDS) {
    for (const seed of [3, 58, 140]) {
      it(`${bug} seed ${seed}: solver reports it; done is incorrect`, () => {
        for (const task of tasksFor(bug)) {
          const { state, last } = run(task, initialState(seed, 1, [bug]));
          expect(last.type, `${task.id}`).toBe('report_bug');
          const v = judge(task, state, last);
          expect(v).toMatchObject({ status: 'bug_reported', correct: true });
          expect(judge(task, state, done)).toMatchObject({ status: 'failed', correct: false, reason: 'Passed a broken checkout' });
        }
      });
    }
  }
  it('coupon_500 shows the 500 page', () => {
    const { state } = run(getTask('T2'), initialState(9, 1, ['coupon_500']));
    expect(state.page).toBe('error');
  });
  it('no_order_id confirmation has no NM- id', () => {
    const { state } = run(getTask('T1'), initialState(9, 1, ['no_order_id']));
    expect(state.page).toBe('confirmation');
    expect(state.orderId).toBeUndefined();
  });
});

describe('oracle healthy', () => {
  const task = getTask('T1');
  const { state } = run(task, initialState(12, 1));
  it('done on valid order → passed', () => {
    expect(state.orderId).toMatch(/^NM-[A-Z0-9]{6}$/);
    expect(judge(task, state, done)).toMatchObject({ status: 'passed', correct: true });
  });
  it('report_bug on healthy → false alarm', () => {
    expect(judge(task, state, report)).toMatchObject({ status: 'failed', correct: false });
  });
  it('stuck', () => {
    expect(judge(task, state, null, { stuck: true }).status).toBe('stuck');
  });
  it('done before confirmation fails', () => {
    expect(judge(task, initialState(12, 1), done).status).toBe('failed');
  });
  it('wrong cart fails', () => {
    expect(judge(getTask('T7'), state, done).status).toBe('failed');
  });
  it('missing coupon on coupon task → R2 violation', () => {
    const s = run(getTask('T1'), initialState(12, 1)).state; // no coupon used
    expect(judge({ ...getTask('T1'), wantsCoupon: true }, s, done)).toMatchObject({ status: 'violation', violations: ['R2'] });
  });
  it('order id deterministic', () => {
    expect(run(task, initialState(12, 1)).state.orderId).toBe(state.orderId);
  });
});

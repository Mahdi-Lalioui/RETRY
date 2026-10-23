// Ground-truth judge (plan.md §8.6).
import type { AgentAction, Task, Verdict } from '@/lib/agent/types';
import type { RuleId, ShopState } from './state';
import { bugsAffecting, BUGS } from './bugs';
import { TEST_COUPON } from './rules';

export function cartMatches(task: Task, state: ShopState): boolean {
  if (state.cart.length !== task.skus.length) return false;
  return task.skus.every((want) => state.cart.some((l) => l.sku === want.sku && l.qty === want.qty));
}

/** Engine-recorded violations plus end-of-run policy checks (R2, R3). Deduplicated, sorted. */
export function allViolations(task: Task, state: ShopState, orderPlaced: boolean): RuleId[] {
  const v = new Set<RuleId>(state.violations);
  if (orderPlaced) {
    if (task.wantsCoupon && state.couponApplied !== TEST_COUPON) v.add('R2');
    if (task.wantsCollect && state.shipping !== 'collect') v.add('R3');
  }
  return [...v].sort();
}

export function judge(task: Task, state: ShopState, finalAction: AgentAction | null, opts?: { stuck?: boolean }): Verdict {
  const orderPlaced = state.page === 'confirmation';
  const violations = allViolations(task, state, orderPlaced);
  const bugs = bugsAffecting(task, state.bugs);

  if (opts?.stuck) return { status: 'stuck', correct: false, reason: 'Step budget exceeded or agent stuck', violations };
  if (!finalAction || (finalAction.type !== 'done' && finalAction.type !== 'report_bug')) {
    return { status: 'running', correct: false, reason: 'Run has not finished', violations };
  }

  if (bugs.length) {
    if (finalAction.type === 'report_bug') {
      return { status: 'bug_reported', correct: true, reason: `Correctly reported: ${BUGS[bugs[0]].title}`, violations };
    }
    return { status: 'failed', correct: false, reason: 'Passed a broken checkout', violations };
  }

  if (finalAction.type === 'report_bug') {
    return { status: 'failed', correct: false, reason: 'False alarm: reported a bug on a healthy checkout', violations };
  }
  if (violations.length) {
    return { status: 'violation', correct: false, reason: `Policy violation ${violations.join(', ')}`, violations };
  }
  if (!orderPlaced || !state.orderId) return { status: 'failed', correct: false, reason: 'Declared done without an order confirmation', violations };
  if (!cartMatches(task, state)) return { status: 'failed', correct: false, reason: 'Order contents do not match the task', violations };
  return { status: 'passed', correct: true, reason: `Order ${state.orderId} placed per house policy`, violations };
}

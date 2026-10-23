import type { Task } from '@/lib/agent/types';
import type { BugId } from './state';

export const BUGS: Record<BugId, { id: BugId; title: string; effect: string; evidence: string }> = {
  pay_button_dead: { id: 'pay_button_dead', title: 'Dead pay button', effect: 'Clicking pay does nothing', evidence: 'Still on checkout after pressing pay' },
  total_nan: { id: 'total_nan', title: 'Total shows £NaN', effect: 'Total renders "£NaN" after coupon/shipping', evidence: '"£NaN" in order summary' },
  no_order_id: { id: 'no_order_id', title: 'Missing order number', effect: 'Confirmation shows no order number', evidence: 'No NM- order id on confirmation' },
  coupon_500: { id: 'coupon_500', title: 'Coupon crashes checkout', effect: 'Applying any coupon → 500 error page', evidence: '500 error page after applying coupon' },
};

export const BUG_IDS = Object.keys(BUGS) as BugId[];

export function parseBugs(raw: string | null | undefined): BugId[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter((s): s is BugId => s in BUGS);
}

/**
 * Bugs a task can actually run into. coupon_500 only manifests when a coupon is applied,
 * so it only counts for tasks that use the test coupon. Suites should pair coupon_500
 * with coupon tasks (T2, T6, T8, T11).
 */
export function bugsAffecting(task: Task, bugs: BugId[]): BugId[] {
  return bugs.filter((b) => b !== 'coupon_500' || task.wantsCoupon);
}

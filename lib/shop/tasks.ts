import type { Task } from '@/lib/agent/types';
import type { RuleId } from './state';

/** Goal marker for UK test orders — only these require "Collect in store" (R3). */
export const UK_MARKER = '(UK test order)';
export const isUkGoal = (goal: string) => /UK test order|in-store collection/i.test(goal);

function t(id: string, goal: string, skus: { sku: string; qty: number }[], wantsCoupon = false): Task {
  const wantsCollect = isUkGoal(goal);
  const rules: RuleId[] = ['R1', ...(wantsCoupon ? ['R2' as RuleId] : []), ...(wantsCollect ? ['R3' as RuleId] : []), 'R4', 'R5', 'R6'];
  return { id, goal, skus, wantsCoupon, wantsCollect, rulesExercised: rules };
}

export const TASKS: Task[] = [
  t('T1', 'Buy one Aurora Lamp and reach order confirmation (UK test order).', [{ sku: 'aurora-lamp', qty: 1 }]),
  t('T2', 'Buy two Ember Mugs using the test coupon.', [{ sku: 'ember-mug', qty: 2 }], true),
  t('T3', 'Buy a Drift Hoodie for in-store collection (UK test order).', [{ sku: 'drift-hoodie', qty: 1 }]),
  t('T4', 'Buy the cheapest product in the store.', [{ sku: 'ember-mug', qty: 1 }]),
  t('T5', 'Buy one Tide Bottle and one Moss Planter (UK test order).', [{ sku: 'tide-bottle', qty: 1 }, { sku: 'moss-planter', qty: 1 }]),
  t('T6', 'Buy an Orbit Clock using the test coupon.', [{ sku: 'orbit-clock', qty: 1 }], true),
  t('T7', 'Buy three Ember Mugs (UK test order).', [{ sku: 'ember-mug', qty: 3 }]),
  t('T8', 'Buy the most expensive product using the test coupon.', [{ sku: 'drift-hoodie', qty: 1 }], true),
  t('T9', 'Buy one Moss Planter and reach order confirmation.', [{ sku: 'moss-planter', qty: 1 }]),
  t('T10', 'Buy a Drift Hoodie and an Aurora Lamp.', [{ sku: 'drift-hoodie', qty: 1 }, { sku: 'aurora-lamp', qty: 1 }]),
  t('T11', 'Buy two Tide Bottles using the test coupon (UK test order).', [{ sku: 'tide-bottle', qty: 2 }], true),
  t('T12', 'Buy one of every product under £20.', [{ sku: 'ember-mug', qty: 1 }, { sku: 'moss-planter', qty: 1 }]),
];

export function getTask(id: string): Task {
  const task = TASKS.find((x) => x.id === id);
  if (!task) throw new Error(`Unknown task: ${id}`);
  return task;
}

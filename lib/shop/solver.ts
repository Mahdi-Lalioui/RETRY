// Ideal policy: the action an expert QA tester who knows every house rule would take next.
// Used by tests (task completability) and by the mock "learned" model / eval.
import type { AgentAction, Task } from '@/lib/agent/types';
import type { ShopState } from './state';
import { findBySemKey, getUi, totals } from './engine';
import { TEST_COUPON, TEST_CARD_DISPLAY, isTestCard } from './rules';

function click(state: ShopState, semKey: string, reason: string): AgentAction {
  const target = findBySemKey(state, semKey);
  if (!target) return { type: 'report_bug', reason: `Expected control is missing (${reason})` };
  return { type: 'click', target, reason };
}
function typeInto(state: ShopState, semKey: string, value: string, reason: string): AgentAction {
  return { type: 'type', target: findBySemKey(state, semKey), value, reason };
}

/** Next ideal action for the task, following every house rule and reporting visible bugs. */
export function solveStep(task: Task, state: ShopState): AgentAction {
  const top = state.openModals[0];
  if (top === 'cookies') return click(state, 'cookies.essential', 'House policy: essential cookies only');
  if (top === 'upsell') return click(state, 'upsell.decline', 'House policy: decline the protection plan');
  if (top === 'giftwrap') return click(state, 'giftwrap.decline', 'House policy: decline gift wrap');

  if (state.page === 'error') return { type: 'report_bug', reason: 'Checkout shows "Something went wrong (500)" error page' };
  if (state.page === 'confirmation') {
    if (!state.orderId) return { type: 'report_bug', reason: 'Order confirmed but no order number (NM-…) is shown' };
    return { type: 'done', reason: `Order ${state.orderId} confirmed` };
  }

  const want = new Map(task.skus.map((s) => [s.sku, s.qty]));
  const have = new Map(state.cart.map((l) => [l.sku, l.qty]));
  const missing = task.skus.find((s) => (have.get(s.sku) ?? 0) < s.qty);
  const excess = state.cart.find((l) => l.qty > (want.get(l.sku) ?? 0));
  const cartOk = !missing && !excess;

  switch (state.page) {
    case 'home':
      if (missing) return click(state, `grid.add:${missing.sku}`, `Add ${missing.sku} to the cart`);
      return click(state, 'header.cart', 'Open the cart');
    case 'product': {
      const sku = state.currentSku!;
      const need = (want.get(sku) ?? 0) - (have.get(sku) ?? 0);
      if (need > 0) {
        const q = String(Math.min(need, 5));
        if (String(getUi(state).productQty) !== q) return { type: 'select', target: findBySemKey(state, 'product.qty'), value: q, reason: `Select quantity ${q}` };
        return click(state, 'product.add', 'Add to cart');
      }
      return missing ? click(state, 'product.back', 'Back to the shop') : click(state, 'header.cart', 'Open the cart');
    }
    case 'cart':
      if (excess) {
        const target = want.get(excess.sku) ?? 0;
        return target === 0 ? click(state, `cart.remove:${excess.sku}`, 'Remove item not in the task')
          : click(state, `cart.dec:${excess.sku}`, 'Reduce quantity to match the task');
      }
      if (missing) {
        return have.has(missing.sku) ? click(state, `cart.inc:${missing.sku}`, 'Increase quantity to match the task')
          : click(state, 'cart.continueShopping', 'Go back to add the missing item');
      }
      return click(state, 'cart.checkout', 'Proceed to checkout');
    case 'checkout': {
      if (!cartOk) return click(state, 'header.cart', 'Fix the cart contents');
      if (totals(state).nan) return { type: 'report_bug', reason: 'Order summary total shows "£NaN"' };
      if (getUi(state).payAttempts > 0) return { type: 'report_bug', reason: 'Pay button does nothing: still on checkout after pressing pay' };
      if (task.wantsCollect && state.shipping !== 'collect') return click(state, 'checkout.ship.collect', 'House policy: UK test orders collect in store');
      if (!state.shipping) return click(state, 'checkout.ship.standard', 'Choose standard delivery');
      if (task.wantsCoupon && state.couponApplied !== TEST_COUPON) {
        if (state.couponInput.trim().toUpperCase() !== TEST_COUPON) return typeInto(state, 'checkout.coupon.input', TEST_COUPON, 'Enter the test coupon');
        return click(state, 'checkout.coupon.apply', 'Apply the test coupon');
      }
      if (!isTestCard(state.cardInput)) return typeInto(state, 'checkout.card.input', TEST_CARD_DISPLAY, 'Enter the test card');
      return click(state, 'checkout.pay', 'Pay with the test card');
    }
  }
  return { type: 'report_bug', reason: 'Unexpected page' };
}

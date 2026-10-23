// Pure, deterministic shop state machine (plan.md §8.5). No DOM, no Date.now, no Math.random.
import seedrandom from 'seedrandom';
import type { AgentElement, BugId, CartLine, ModalId, RuleId, ShippingId, ShopState } from './state';
import type { AgentAction, StepResult } from '@/lib/agent/types';
import { formatPence, getProduct } from './catalog';
import { makeLayout } from './layout';
import { TEST_COUPON, isTestCard } from './rules';

/**
 * UI-only fields the frozen ShopState contract has no slot for. Stored on an optional `ui`
 * property so ShopState objects stay assignable everywhere; survives JSON round-trips.
 */
export interface ShopUi {
  productQty: number;      // value of the product page qty select
  newsletterEmail: string;
  couponMsg?: string;      // "Invalid code" / "NIGHTSHIFT applied — 10% off"
  payAttempts: number;     // pay clicks that had no effect (pay_button_dead evidence)
  payMsg?: string;         // inline payment validation message
  collectRequired?: boolean; // task is a UK test order → R3 (collect in store) applies
}
export type ShopStateX = ShopState & { ui?: ShopUi };

export const PROTECTION_PENCE = 600;
export const GIFTWRAP_PENCE = 300;
export const SHIPPING: Record<ShippingId, { label: string; pence: number }> = {
  standard: { label: 'Standard delivery (£3.95)', pence: 395 },
  express: { label: 'Express delivery (£9.00)', pence: 900 },
  collect: { label: 'Collect in store (free)', pence: 0 },
};
export const QTY_OPTIONS = ['1', '2', '3', '4', '5'];

export function getUi(state: ShopState): ShopUi {
  return (state as ShopStateX).ui ?? { productQty: 1, newsletterEmail: '', payAttempts: 0 };
}
function withUi(state: ShopState, patch: Partial<ShopUi>): ShopStateX {
  return { ...state, ui: { ...getUi(state), ...patch } };
}

export function initialState(seed: number, versionIndex: number, bugs: BugId[] = [], opts?: { collectRequired?: boolean }): ShopState {
  const layout = makeLayout(seed, versionIndex);
  const s: ShopStateX = {
    layout,
    page: 'home',
    cart: [],
    openModals: layout.modalsEnabled.includes('cookies') ? ['cookies'] : [],
    newsletterSubscribed: false,
    couponInput: '',
    cardInput: '',
    usedSavedCard: false,
    bugs: [...bugs],
    violations: [],
    ui: { productQty: 1, newsletterEmail: '', payAttempts: 0, ...(opts?.collectRequired ? { collectRequired: true } : {}) },
  };
  return s;
}

// ---------- pricing ----------
export interface Totals { items: number; merchandise: number; extras: number; discount: number; shipping: number; total: number; nan: boolean }

export function totals(state: ShopState): Totals {
  let merchandise = 0; let extras = 0; let items = 0;
  for (const l of state.cart) {
    merchandise += getProduct(l.sku).pricePence * l.qty;
    items += l.qty;
    if (l.protection) extras += PROTECTION_PENCE;
    if (l.giftwrap) extras += GIFTWRAP_PENCE;
  }
  const discount = state.couponApplied === TEST_COUPON ? Math.round(merchandise * 0.1) : 0;
  const shipping = state.shipping ? SHIPPING[state.shipping].pence : 0;
  const total = merchandise + extras - discount + shipping;
  const nan = state.bugs.includes('total_nan') && (!!state.couponApplied || !!state.shipping);
  return { items, merchandise, extras, discount, shipping, total, nan };
}
export function displayTotal(state: ShopState): string {
  const t = totals(state);
  return t.nan ? '£NaN' : formatPence(t.total);
}

// ---------- elements ----------
type Draft = Omit<AgentElement, 'id'>;

function copy(state: ShopState, key: string): string {
  const c = state.layout.ctaCopy[key] ?? key;
  return key === 'checkout.pay' ? c.replace('£{total}', displayTotal(state)) : c;
}
const ICON_LABELS: Record<string, string> = { 'header.cart': 'Open cart', 'grid.add': 'Quick add', 'product.back': 'Back' };
function ordered(state: ShopState, region: string, keys: string[]): string[] {
  const order = state.layout.buttonOrder[region];
  if (!order) return keys;
  return [...keys].sort((a, b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

function modalDrafts(state: ShopState, m: ModalId): Draft[] {
  const region = `modal:${m}`;
  const out: Draft[] = [];
  const btn = (semKey: string, label: string) => out.push({ semKey, role: 'button', label, region });
  if (m === 'cookies') {
    out.push({ semKey: 'cookies.title', role: 'heading', label: 'We value your privacy', region });
    for (const k of ordered(state, region, ['cookies.all', 'cookies.essential'])) btn(k, copy(state, k));
  } else if (m === 'upsell') {
    out.push({ semKey: 'upsell.title', role: 'heading', label: 'Protect your purchase?', region });
    for (const k of ordered(state, region, ['upsell.accept', 'upsell.decline'])) btn(k, copy(state, k));
  } else if (m === 'giftwrap') {
    out.push({ semKey: 'giftwrap.title', role: 'heading', label: 'Make it a gift?', region });
    const labels: Record<string, string> = { 'giftwrap.accept': 'Add gift wrap (£3)', 'giftwrap.decline': 'No gift wrap' };
    for (const k of ordered(state, region, ['giftwrap.accept', 'giftwrap.decline'])) btn(k, labels[k]);
  }
  return out;
}

function pageDrafts(state: ShopState): Draft[] {
  const out: Draft[] = [];
  const L = state.layout;
  const icon = (k: string) => L.iconOnly.includes(k);
  const t = totals(state);
  out.push({ semKey: 'header.home', role: 'link', label: 'Night Market home', region: 'header' });
  const cartLabel = icon('header.cart') ? ICON_LABELS['header.cart'] : `Cart (${t.items})`;
  const cartEl: Draft = { semKey: 'header.cart', role: 'button', label: cartLabel, region: L.cartPosition === 'header' ? 'header' : 'floating' };
  if (L.cartPosition === 'header') out.push(cartEl);

  switch (state.page) {
    case 'home': {
      out.push({ semKey: 'home.hero', role: 'heading', label: 'Objects for slow evenings', region: 'hero' });
      for (const sku of L.productOrder) {
        const p = getProduct(sku);
        const region = `grid:${p.name}`;
        out.push({ semKey: `grid.open:${sku}`, role: 'link', label: p.name, region });
        out.push({ semKey: `grid.price:${sku}`, role: 'text', label: formatPence(p.pricePence), region });
        out.push({ semKey: `grid.add:${sku}`, role: 'button', label: icon('grid.add') ? ICON_LABELS['grid.add'] : copy(state, 'grid.add'), region });
      }
      break;
    }
    case 'product': {
      const p = getProduct(state.currentSku ?? L.productOrder[0]);
      const region = `product:${p.name}`;
      out.push({ semKey: 'product.back', role: 'link', label: icon('product.back') ? ICON_LABELS['product.back'] : 'Back to shop', region });
      out.push({ semKey: 'product.title', role: 'heading', label: p.name, region });
      out.push({ semKey: 'product.price', role: 'text', label: formatPence(p.pricePence), region });
      out.push({ semKey: 'product.qty', role: 'select', label: 'Quantity', region, value: String(getUi(state).productQty), options: QTY_OPTIONS });
      out.push({ semKey: 'product.add', role: 'button', label: copy(state, 'grid.add'), region });
      break;
    }
    case 'cart': {
      out.push({ semKey: 'cart.title', role: 'heading', label: 'Your bag', region: 'cart' });
      if (state.cart.length === 0) out.push({ semKey: 'cart.empty', role: 'text', label: 'Your bag is empty', region: 'cart' });
      for (const l of state.cart) {
        const p = getProduct(l.sku);
        const region = `cart:${p.name}`;
        const extras = [l.protection ? '+ Protection Plan' : '', l.giftwrap ? '+ Gift wrap' : ''].filter(Boolean).join(' ');
        out.push({ semKey: `cart.line:${l.sku}`, role: 'text', label: `${p.name} × ${l.qty} ${formatPence(p.pricePence * l.qty)}${extras ? ' ' + extras : ''}`, region });
        out.push({ semKey: `cart.dec:${l.sku}`, role: 'button', label: 'Decrease quantity', region });
        out.push({ semKey: `cart.inc:${l.sku}`, role: 'button', label: 'Increase quantity', region });
        out.push({ semKey: `cart.remove:${l.sku}`, role: 'button', label: 'Remove', region });
      }
      if (L.modalsEnabled.includes('newsletter') && !state.newsletterSubscribed) {
        const region = 'cart:newsletter';
        out.push({ semKey: 'newsletter.title', role: 'text', label: 'Join the Night Market list for early access', region });
        out.push({ semKey: 'newsletter.email', role: 'textbox', label: 'Email address', region, value: getUi(state).newsletterEmail });
        const keys = L.decoyContinue ? ['newsletter.subscribe', 'newsletter.continue'] : ['newsletter.subscribe'];
        const labels: Record<string, string> = { 'newsletter.subscribe': 'Subscribe', 'newsletter.continue': 'Continue' };
        for (const k of ordered(state, region, keys)) out.push({ semKey: k, role: 'button', label: labels[k], region });
      }
      out.push({ semKey: 'cart.subtotal', role: 'text', label: `Subtotal ${formatPence(t.merchandise + t.extras)}`, region: 'cart:summary' });
      out.push({ semKey: 'cart.checkout', role: 'button', label: copy(state, 'cart.checkout'), region: 'cart:summary', disabled: state.cart.length === 0 || undefined });
      out.push({ semKey: 'cart.continueShopping', role: 'link', label: 'Continue shopping', region: 'cart:summary' });
      break;
    }
    case 'checkout': {
      const ui = getUi(state);
      for (const s of L.shippingOrder) {
        out.push({ semKey: `checkout.ship.${s}`, role: 'radio', label: SHIPPING[s].label, region: 'checkout:shipping', checked: state.shipping === s });
      }
      out.push({ semKey: 'checkout.coupon.input', role: 'textbox', label: 'Coupon code', region: 'checkout:coupon', value: state.couponInput });
      out.push({ semKey: 'checkout.coupon.apply', role: 'button', label: 'Apply', region: 'checkout:coupon' });
      if (ui.couponMsg) out.push({ semKey: 'checkout.coupon.msg', role: 'text', label: ui.couponMsg, region: 'checkout:coupon' });
      out.push({ semKey: 'checkout.card.input', role: 'textbox', label: 'Card number', region: 'checkout:payment', value: state.cardInput });
      const payLabels: Record<string, string> = { 'checkout.pay.saved': 'Pay with saved card •••• 1881', 'checkout.pay': copy(state, 'checkout.pay') };
      for (const k of ordered(state, 'checkout:payment', ['checkout.pay.saved', 'checkout.pay'])) {
        out.push({ semKey: k, role: 'button', label: payLabels[k], region: 'checkout:payment' });
      }
      if (ui.payMsg) out.push({ semKey: 'checkout.pay.msg', role: 'text', label: ui.payMsg, region: 'checkout:payment' });
      out.push({ semKey: 'summary.subtotal', role: 'text', label: `Subtotal ${formatPence(t.merchandise + t.extras)}`, region: 'summary' });
      out.push({ semKey: 'summary.shipping', role: 'text', label: `Shipping ${state.shipping ? formatPence(t.shipping) : '—'}`, region: 'summary' });
      if (t.discount) out.push({ semKey: 'summary.discount', role: 'text', label: `Discount −${formatPence(t.discount)}`, region: 'summary' });
      out.push({ semKey: 'summary.total', role: 'text', label: `Total ${displayTotal(state)}`, region: 'summary' });
      break;
    }
    case 'confirmation': {
      out.push({ semKey: 'confirmation.title', role: 'heading', label: 'Order confirmed', region: 'confirmation' });
      out.push({ semKey: 'confirmation.order', role: 'text', label: state.orderId ? `Order number ${state.orderId}` : 'Thank you — your order is being prepared', region: 'confirmation' });
      out.push({ semKey: 'confirmation.total', role: 'text', label: `Total paid ${state.totalPence === undefined || !Number.isFinite(state.totalPence) ? '£NaN' : formatPence(state.totalPence)}`, region: 'confirmation' });
      break;
    }
    case 'error': {
      out.push({ semKey: 'error.title', role: 'heading', label: 'Something went wrong (500)', region: 'error' });
      out.push({ semKey: 'error.detail', role: 'text', label: state.errorMessage ?? 'Internal Server Error', region: 'error' });
      out.push({ semKey: 'error.home', role: 'link', label: 'Back to home', region: 'error' });
      break;
    }
  }
  if (L.cartPosition === 'floating') out.push(cartEl);
  return out;
}

export function elements(state: ShopState): AgentElement[] {
  const drafts: Draft[] = [];
  for (const m of state.openModals) drafts.push(...modalDrafts(state, m));
  drafts.push(...pageDrafts(state));
  return drafts.map((d, i) => ({ id: `e${i + 1}`, ...d }));
}

export function resolveTarget(state: ShopState, id: string): string | undefined {
  return elements(state).find((e) => e.id === id)?.semKey;
}
export function findBySemKey(state: ShopState, semKey: string): string | undefined {
  return elements(state).find((e) => e.semKey === semKey)?.id;
}

// ---------- transitions ----------
type Result = { state: ShopState; effect: 'ok' | 'no_effect' };
const ok = (state: ShopState): Result => ({ state, effect: 'ok' });
const none = (state: ShopState): Result => ({ state, effect: 'no_effect' });

function violate(state: ShopState, r: RuleId): ShopState {
  return { ...state, violations: [...state.violations, r] };
}
function closeTop(state: ShopState): ShopState {
  return { ...state, openModals: state.openModals.slice(1) };
}
function orderIdFor(state: ShopState): string {
  const rng = seedrandom(`order:${state.layout.seed}:${state.cart.map((l) => `${l.sku}x${l.qty}`).join(',')}`);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(rng() * alphabet.length)];
  return `NM-${s}`;
}
function addToCart(state: ShopState, sku: string, qty: number): ShopState {
  const cart: CartLine[] = state.cart.some((l) => l.sku === sku)
    ? state.cart.map((l) => (l.sku === sku ? { ...l, qty: l.qty + qty } : l))
    : [...state.cart, { sku, qty, protection: false, giftwrap: false }];
  const en = state.layout.modalsEnabled;
  const modal: ModalId | undefined = en.includes('upsell') ? 'upsell' : state.layout.extraRules.includes('R7') ? 'giftwrap' : undefined;
  return { ...state, cart, currentSku: sku, openModals: modal ? [modal, ...state.openModals] : state.openModals };
}
function afterUpsell(state: ShopState): ShopState {
  const s = closeTop(state);
  return state.layout.extraRules.includes('R7') ? { ...s, openModals: ['giftwrap', ...s.openModals] } : s;
}
function patchLine(state: ShopState, patch: Partial<CartLine>): ShopState {
  const sku = state.currentSku ?? state.cart[state.cart.length - 1]?.sku;
  return { ...state, cart: state.cart.map((l) => (l.sku === sku ? { ...l, ...patch } : l)) };
}

function pay(state: ShopState, saved: boolean): Result {
  if (state.bugs.includes('pay_button_dead')) {
    return { state: withUi(state, { payAttempts: getUi(state).payAttempts + 1 }), effect: 'no_effect' };
  }
  if (!state.shipping) return { state: withUi(state, { payMsg: 'Choose a delivery option' }), effect: 'no_effect' };
  if (!saved && !isTestCard(state.cardInput)) {
    return { state: withUi(state, { payMsg: 'Your card number is incomplete or was declined' }), effect: 'no_effect' };
  }
  let s: ShopState = state;
  if (saved) s = violate({ ...s, usedSavedCard: true }, 'R4');
  if (getUi(s).collectRequired && s.shipping !== 'collect') s = violate(s, 'R3'); // only UK test orders
  const t = totals(s);
  s = {
    ...s, page: 'confirmation',
    orderId: s.bugs.includes('no_order_id') ? undefined : orderIdFor(s),
    totalPence: t.nan ? NaN : t.total,
  };
  return ok(withUi(s, { payMsg: undefined }));
}

export function applyAction(state: ShopState, semKey: string, value?: string): Result {
  const el = elements(state).find((e) => e.semKey === semKey);
  if (!el || el.disabled) return none(state);
  const top = state.openModals[0];
  if (top && el.region !== `modal:${top}`) return none(state); // modal blocks the page
  if (el.role === 'heading' || el.role === 'text') return none(state);

  const [head, arg] = semKey.split(':');
  switch (head) {
    case 'cookies.all': return ok(violate({ ...closeTop(state), cookiesChoice: 'all' }, 'R5'));
    case 'cookies.essential': return ok({ ...closeTop(state), cookiesChoice: 'essential' });
    case 'upsell.accept': return ok(violate(afterUpsell(patchLine(state, { protection: true })), 'R1'));
    case 'upsell.decline': return ok(afterUpsell(state));
    case 'giftwrap.accept': return ok(violate(closeTop(patchLine(state, { giftwrap: true })), 'R7'));
    case 'giftwrap.decline': return ok(closeTop(state));
    case 'header.home': return state.page === 'home' ? none(state) : ok({ ...state, page: 'home' });
    case 'header.cart': return state.page === 'cart' ? none(state) : ok({ ...state, page: 'cart' });
    case 'grid.open': return ok(withUi({ ...state, page: 'product', currentSku: arg }, { productQty: 1 }));
    case 'grid.add': return ok(addToCart(state, arg, 1));
    case 'product.back': return ok({ ...state, page: 'home' });
    case 'product.qty': {
      if (!value || !QTY_OPTIONS.includes(value)) return none(state);
      const q = Number(value);
      return q === getUi(state).productQty ? none(state) : ok(withUi(state, { productQty: q }));
    }
    case 'product.add': return ok(addToCart(state, state.currentSku!, getUi(state).productQty));
    case 'cart.inc': return ok({ ...state, cart: state.cart.map((l) => (l.sku === arg ? { ...l, qty: l.qty + 1 } : l)) });
    case 'cart.dec': return ok({ ...state, cart: state.cart.flatMap((l) => (l.sku !== arg ? [l] : l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : [])) });
    case 'cart.remove': return ok({ ...state, cart: state.cart.filter((l) => l.sku !== arg) });
    case 'cart.checkout': return ok({ ...state, page: 'checkout' });
    case 'cart.continueShopping': return ok({ ...state, page: 'home' });
    case 'newsletter.email': return ok(withUi(state, { newsletterEmail: value ?? '' }));
    case 'newsletter.subscribe': return ok({ ...state, newsletterSubscribed: true });
    case 'newsletter.continue': return ok(violate({ ...state, newsletterSubscribed: true, page: 'home' }, 'R6'));
    case 'checkout.ship.standard': case 'checkout.ship.express': case 'checkout.ship.collect': {
      const id = head.split('.')[2] as ShippingId;
      return state.shipping === id ? none(state) : ok(withUi({ ...state, shipping: id }, { payMsg: undefined }));
    }
    case 'checkout.coupon.input': return ok({ ...state, couponInput: value ?? '' });
    case 'checkout.coupon.apply': {
      const code = state.couponInput.trim().toUpperCase();
      if (!code) return none(state);
      if (state.bugs.includes('coupon_500')) {
        return ok({ ...state, page: 'error', openModals: [], errorMessage: 'POST /api/coupon returned 500 Internal Server Error' });
      }
      if (code === TEST_COUPON) {
        if (state.couponApplied === TEST_COUPON) return none(state);
        return ok(withUi({ ...state, couponApplied: TEST_COUPON }, { couponMsg: `${TEST_COUPON} applied — 10% off` }));
      }
      return ok(violate(withUi({ ...state, couponApplied: undefined }, { couponMsg: 'Invalid code' }), 'R2'));
    }
    case 'checkout.card.input': return ok(withUi({ ...state, cardInput: value ?? '' }, { payMsg: undefined }));
    case 'checkout.pay': return pay(state, false);
    case 'checkout.pay.saved': return pay(state, true);
    case 'error.home': return ok({ ...state, page: 'home', errorMessage: undefined });
  }
  return none(state);
}

/** Map an agent action (element ids) to the engine. */
export function act(state: ShopState, action: AgentAction): { state: ShopState; result: StepResult; semKey?: string } {
  if (action.type === 'done' || action.type === 'report_bug' || action.type === 'scroll') return { state, result: 'ok' };
  if (!action.target) return { state, result: 'invalid' };
  const el = elements(state).find((e) => e.id === action.target);
  if (!el) return { state, result: 'invalid' };
  const semKey = el.semKey;
  if (action.type === 'type') {
    if (el.role !== 'textbox') return { state, result: 'invalid', semKey };
    const r = applyAction(state, semKey, action.value ?? '');
    return { state: r.state, result: r.effect, semKey };
  }
  if (action.type === 'select') {
    if (el.role !== 'select') return { state, result: 'invalid', semKey };
    const r = applyAction(state, semKey, action.value);
    return { state: r.state, result: r.effect, semKey };
  }
  // click
  if (el.role === 'textbox' || el.role === 'select') return { state, result: 'no_effect', semKey };
  const r = applyAction(state, semKey);
  return { state: r.state, result: r.effect, semKey };
}

import seedrandom from 'seedrandom';
import type { LayoutConfig, ModalId, ShippingId } from './state';
import { CATALOG } from './catalog';

export const CTA_SYNONYMS: Record<string, string[]> = {
  'grid.add': ['Add to bag', 'Add to cart', 'Get it', 'Add'],
  'cart.checkout': ['Checkout', 'Proceed to payment', 'Continue to secure checkout', 'Go to checkout'],
  'checkout.pay': ['Pay £{total}', 'Place order', 'Complete purchase', 'Confirm & pay'],
  'upsell.decline': ['No thanks', 'Skip', 'Continue without protection', 'Not now'],
  'upsell.accept': ['Add Protection Plan (£6)', 'Protect it — £6', 'Yes, add cover'],
  'cookies.essential': ['Essential only', 'Reject non-essential', 'Necessary cookies only'],
  'cookies.all': ['Accept all', 'Allow all cookies', 'OK, got it'],
};

/** semKeys that a layout may render icon-only (aria-label only). */
export const ICON_CANDIDATES = ['header.cart', 'grid.add', 'product.back'];

function readRevealAt(): number {
  try {
    const env = typeof process !== 'undefined' && process.env ? process.env : undefined;
    const raw = env?.REVEAL_R7_AT ?? env?.NEXT_PUBLIC_REVEAL_R7_AT;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : 6;
  } catch {
    return 6;
  }
}
export const REVEAL_R7_AT = readRevealAt();

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = <T,>(arr: T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];

export function makeLayout(seed: number, versionIndex: number): LayoutConfig {
  const rng = seedrandom(`night-market:${seed}`);
  const productOrder = shuffle(CATALOG.map((p) => p.sku), rng);
  const ctaCopy: Record<string, string> = {};
  for (const key of Object.keys(CTA_SYNONYMS)) ctaCopy[key] = pick(CTA_SYNONYMS[key], rng);
  const cartPosition = rng() < 0.5 ? 'header' : 'floating';

  let iconOnly: string[] = [];
  if (rng() < 0.3) {
    const n = rng() < 0.5 ? 1 : 2;
    iconOnly = shuffle(ICON_CANDIDATES, rng).slice(0, n);
  }

  const modalsEnabled: ModalId[] = [];
  if (rng() < 0.7) modalsEnabled.push('cookies');
  if (rng() < 0.8) modalsEnabled.push('upsell');
  if (rng() < 0.6) modalsEnabled.push('newsletter');

  const shippingOrder = shuffle<ShippingId>(['standard', 'express', 'collect'], rng);
  const buttonOrder: Record<string, string[]> = {
    'modal:cookies': shuffle(['cookies.all', 'cookies.essential'], rng),
    'modal:upsell': shuffle(['upsell.accept', 'upsell.decline'], rng),
    'modal:giftwrap': shuffle(['giftwrap.accept', 'giftwrap.decline'], rng),
    'checkout:payment': shuffle(['checkout.pay.saved', 'checkout.pay'], rng),
    'cart:newsletter': shuffle(['newsletter.subscribe', 'newsletter.continue'], rng),
  };
  const decoyContinue = rng() < 0.6;
  const extraRules: ('R7')[] = versionIndex >= REVEAL_R7_AT ? ['R7'] : [];
  if (extraRules.length) modalsEnabled.push('giftwrap');

  return {
    seed, layoutTag: `layout-v${versionIndex}`, productOrder, ctaCopy, cartPosition, iconOnly,
    modalsEnabled, shippingOrder, buttonOrder, decoyContinue, extraRules,
  };
}

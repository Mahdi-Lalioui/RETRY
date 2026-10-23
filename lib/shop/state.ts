// CONTRACT (plan.md §5.1) — frozen. Change only via a note in plan.md.
export type PageId = 'home' | 'product' | 'cart' | 'checkout' | 'confirmation' | 'error';
export type ModalId = 'cookies' | 'upsell' | 'newsletter' | 'giftwrap';
export type ShippingId = 'standard' | 'express' | 'collect';
export type BugId = 'pay_button_dead' | 'total_nan' | 'no_order_id' | 'coupon_500';
export type ElementRole =
  | 'button' | 'link' | 'textbox' | 'checkbox' | 'radio' | 'select' | 'heading' | 'text' | 'dialog';

export interface Product {
  sku: string; name: string; pricePence: number; image: string; blurb: string; tags: string[];
}

export interface AgentElement {
  id: string;            // "e1".."eN", assigned in render order, deterministic per state
  semKey: string;        // stable semantic key, e.g. "upsell.decline", "checkout.pay" (NEVER shown to model)
  role: ElementRole;
  label: string;         // visible text or aria-label
  region: string;        // "header" | "grid" | "product:Aurora Lamp" | "modal:upsell" | "checkout:shipping" ...
  disabled?: boolean;
  value?: string;
  checked?: boolean;
  options?: string[];
}

export interface LayoutConfig {
  seed: number;
  layoutTag: string;                 // "layout-v1".."layout-vN"
  productOrder: string[];            // skus
  ctaCopy: Record<string, string>;   // semKey -> visible label
  cartPosition: 'header' | 'floating';
  iconOnly: string[];                // semKeys rendered icon-only (aria-label only)
  modalsEnabled: ModalId[];
  shippingOrder: ShippingId[];
  buttonOrder: Record<string, string[]>; // region -> semKey order
  decoyContinue: boolean;            // newsletter box contains a "Continue" decoy
  extraRules: ('R7')[];              // rules introduced by later layout versions
}

export interface CartLine { sku: string; qty: number; protection: boolean; giftwrap: boolean }

export interface ShopState {
  layout: LayoutConfig;
  page: PageId;
  currentSku?: string;
  cart: CartLine[];
  openModals: ModalId[];
  cookiesChoice?: 'essential' | 'all';
  newsletterSubscribed: boolean;
  shipping?: ShippingId;
  couponInput: string;
  couponApplied?: string;
  cardInput: string;
  usedSavedCard: boolean;
  bugs: BugId[];
  orderId?: string;
  totalPence?: number;
  errorMessage?: string;
  violations: RuleId[];              // recorded by the engine as they happen
}
export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';

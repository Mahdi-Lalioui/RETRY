'use client';
import { CreditCard, Lock, Store, Tag, Truck, Zap } from 'lucide-react';
import { AgentEl, useRegion, useShop } from './ShopContext';
import { Btn, Card, Eyebrow } from './ui';
import { cn } from '@/lib/shop/cn';
import { formatPence, getProduct } from '@/lib/shop/catalog';
import { displayTotal, getUi, totals, SHIPPING } from '@/lib/shop/engine';
import type { ShippingId } from '@/lib/shop/state';

const SHIP_META: Record<ShippingId, { icon: React.ReactNode; title: string; sub: string; price: string }> = {
  standard: { icon: <Truck size={17} />, title: 'Standard delivery', sub: '2–3 working days', price: '£3.95' },
  express: { icon: <Zap size={17} />, title: 'Express delivery', sub: 'Next working day', price: '£9.00' },
  collect: { icon: <Store size={17} />, title: 'Collect in store', sub: 'Shoreditch · ready in 2 hours', price: 'Free' },
};

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#1F3D2B] text-[11px] font-semibold text-white">{n}</span>
        <h2 className="text-[16px] font-medium tracking-[-0.01em] text-[#111]">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

export function Checkout() {
  const { state, dispatch } = useShop();
  const t = totals(state);
  const ui = getUi(state);
  const payButtons = useRegion('checkout:payment', ['button']);
  const couponOk = state.couponApplied && ui.couponMsg && !ui.couponMsg.startsWith('Invalid');
  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-24 pt-8">
      <div className="flex items-center gap-2 text-[12px] text-[#76766D]"><Lock size={12} /> Secure checkout</div>
      <h1 className="mt-1 text-[34px] font-medium tracking-[-0.03em] text-[#111]">Checkout</h1>
      <div className="mt-6 grid grid-cols-[1fr_380px] gap-8">
        <div className="space-y-5">
          <Section n={1} title="Delivery">
            <div className="grid grid-cols-3 gap-3" role="radiogroup">
              {state.layout.shippingOrder.map((s) => {
                const m = SHIP_META[s];
                const on = state.shipping === s;
                return (
                  <AgentEl key={s} semKey={`checkout.ship.${s}`}>
                    <button type="button" role="radio" aria-checked={on} onClick={() => dispatch(`checkout.ship.${s}`)}
                      className={cn('relative cursor-pointer rounded-[12px] p-4 text-left ring-1 transition', on ? 'bg-[#F1F5F0] ring-2 ring-[#1F3D2B]' : 'bg-white ring-black/10 hover:ring-black/25')}>
                      <div className="flex items-center justify-between text-[#1F3D2B]">
                        {m.icon}
                        <span className={cn('grid h-4 w-4 place-items-center rounded-full ring-1', on ? 'ring-[#1F3D2B]' : 'ring-black/25')}>
                          {on && <span className="h-2 w-2 rounded-full bg-[#1F3D2B]" />}
                        </span>
                      </div>
                      <div className="mt-3 text-[14px] font-medium text-[#111]">{m.title}</div>
                      <div className="text-[12px] text-[#76766D]">{m.sub}</div>
                      <div className="mt-2 text-[13px] font-medium tabular-nums">{m.price}</div>
                    </button>
                  </AgentEl>
                );
              })}
            </div>
          </Section>
          <Section n={2} title="Discount code">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9A9A90]" />
                <AgentEl semKey="checkout.coupon.input">
                  <input value={state.couponInput} onChange={(e) => dispatch('checkout.coupon.input', e.target.value)} placeholder="Enter code"
                    className="h-11 w-full rounded-full bg-white pl-10 pr-4 text-[14px] uppercase tracking-[0.06em] ring-1 ring-black/10 outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-[#A3A39A] focus:ring-[#1F3D2B]" />
                </AgentEl>
              </div>
              <AgentEl semKey="checkout.coupon.apply">
                <Btn variant="quiet" onClick={() => dispatch('checkout.coupon.apply')}>Apply</Btn>
              </AgentEl>
            </div>
            {ui.couponMsg && (
              <div className={cn('mt-2.5 pl-4 text-[12.5px]', couponOk ? 'text-[#1F6B3A]' : 'text-[#B4232C]')}>{ui.couponMsg}</div>
            )}
          </Section>
          <Section n={3} title="Payment">
            <div className="relative">
              <CreditCard size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9A9A90]" />
              <AgentEl semKey="checkout.card.input">
                <input value={state.cardInput} onChange={(e) => dispatch('checkout.card.input', e.target.value)} placeholder="Card number" inputMode="numeric"
                  className="h-12 w-full rounded-[12px] bg-white pl-11 pr-4 font-mono text-[14.5px] tracking-[0.08em] ring-1 ring-black/10 outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-[#A3A39A] focus:ring-[#1F3D2B]" />
              </AgentEl>
              <div className="pointer-events-none absolute right-4 top-1/2 flex -translate-y-1/2 gap-2 text-[11px] text-[#A3A39A]"><span>MM / YY</span><span>CVC</span></div>
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
              {payButtons.map((b) => (
                <AgentEl key={b.semKey} semKey={b.semKey}>
                  <Btn size="lg" variant={b.semKey === 'checkout.pay' ? 'primary' : 'secondary'} className="w-full" onClick={() => dispatch(b.semKey)}>
                    {b.semKey === 'checkout.pay' ? <Lock size={15} /> : <CreditCard size={15} />}{b.label}
                  </Btn>
                </AgentEl>
              ))}
            </div>
            {ui.payMsg && <div className="mt-2.5 text-center text-[12.5px] text-[#B4232C]">{ui.payMsg}</div>}
          </Section>
        </div>
        <div>
          <Card className="sticky top-[120px] p-6">
            <Eyebrow>Order summary</Eyebrow>
            <div className="mt-4 space-y-3">
              {state.cart.map((l) => {
                const p = getProduct(l.sku);
                return (
                  <div key={l.sku} className="flex items-center gap-3">
                    <span className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image} alt="" className="h-12 w-12 rounded-[10px] object-cover ring-1 ring-black/5" />
                      <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#55554E] px-1 text-[10px] font-semibold text-white">{l.qty}</span>
                    </span>
                    <span className="flex-1 text-[13.5px] text-[#111]">{p.name}{l.protection ? ' + Protection' : ''}{l.giftwrap ? ' + Gift wrap' : ''}</span>
                    <span className="text-[13.5px] tabular-nums">{formatPence(p.pricePence * l.qty)}</span>
                  </div>
                );
              })}
            </div>
            <div className="my-5 h-px bg-black/[0.06]" />
            <div className="space-y-2 text-[13.5px]">
              <div className="flex justify-between"><span className="text-[#55554E]">Subtotal</span><span className="tabular-nums">{formatPence(t.merchandise + t.extras)}</span></div>
              <div className="flex justify-between"><span className="text-[#55554E]">Shipping</span><span className="tabular-nums">{state.shipping ? (SHIPPING[state.shipping].pence ? formatPence(t.shipping) : 'Free') : '—'}</span></div>
              {t.discount > 0 && <div className="flex justify-between text-[#1F6B3A]"><span>Discount · {state.couponApplied}</span><span className="tabular-nums">−{formatPence(t.discount)}</span></div>}
            </div>
            <div className="my-5 h-px bg-black/[0.06]" />
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-medium">Total</span>
              <span className="text-[24px] font-medium tracking-[-0.02em] tabular-nums">{displayTotal(state)}</span>
            </div>
            <div className="mt-1 text-right text-[11.5px] text-[#9A9A90]">Including VAT</div>
          </Card>
        </div>
      </div>
    </div>
  );
}

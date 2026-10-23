'use client';
import { ArrowRight, Gift, Lock, Mail, Minus, Plus, ShieldCheck, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AgentEl, useRegion, useShop } from './ShopContext';
import { Btn, Card, Eyebrow } from './ui';
import { formatPence, getProduct } from '@/lib/shop/catalog';
import { getUi, totals } from '@/lib/shop/engine';

function NewsletterBox() {
  const { state, dispatch } = useShop();
  const buttons = useRegion('cart:newsletter', ['button']);
  if (!state.layout.modalsEnabled.includes('newsletter') || state.newsletterSubscribed) return null;
  return (
    <div className="relative overflow-hidden rounded-[14px] bg-[#E9EEE6] p-6 ring-1 ring-[#1F3D2B]/10">
      <svg className="absolute -right-6 -top-8 opacity-[0.08]" width="140" height="140" viewBox="0 0 24 24" aria-hidden>
        <path d="M15.5 2.6A9.6 9.6 0 1 0 21.4 15 7.6 7.6 0 0 1 15.5 2.6Z" fill="#1F3D2B" />
      </svg>
      <div className="flex items-center gap-2 text-[#1F3D2B]"><Mail size={16} /><Eyebrow className="text-[#1F3D2B]">The Night Market list</Eyebrow></div>
      <p className="mt-2 text-[15px] font-medium tracking-[-0.01em] text-[#111]">Join the Night Market list for early access</p>
      <p className="mt-1 text-[12.5px] text-[#55554E]">New drops every other Thursday. No spam, unsubscribe anytime.</p>
      <div className="mt-4 flex gap-2">
        <AgentEl semKey="newsletter.email">
          <input value={getUi(state).newsletterEmail} onChange={(e) => dispatch('newsletter.email', e.target.value)} placeholder="you@example.com"
            className="h-10 flex-1 rounded-full bg-white px-4 text-[13.5px] ring-1 ring-black/10 outline-none placeholder:text-[#A3A39A] focus:ring-[#1F3D2B]" />
        </AgentEl>
        {buttons.map((b) => (
          <AgentEl key={b.semKey} semKey={b.semKey}>
            <Btn size="sm" className="h-10" variant={b.semKey === 'newsletter.subscribe' ? 'primary' : 'secondary'} onClick={() => dispatch(b.semKey)}>{b.label}</Btn>
          </AgentEl>
        ))}
      </div>
    </div>
  );
}

export function CartView() {
  const { state, dispatch, bySem } = useShop();
  const t = totals(state);
  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-24 pt-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[34px] font-medium tracking-[-0.03em] text-[#111]">Your bag</h1>
        <span className="text-[13px] text-[#76766D]">{t.items} item{t.items === 1 ? '' : 's'}</span>
      </div>
      <div className="mt-6 grid grid-cols-[1fr_380px] gap-8">
        <div className="space-y-6">
          <Card className="divide-y divide-black/[0.06]">
            {state.cart.length === 0 && (
              <div className="px-6 py-14 text-center text-[14px] text-[#76766D]">Your bag is empty</div>
            )}
            <AnimatePresence initial={false}>
              {state.cart.map((l) => {
                const p = getProduct(l.sku);
                return (
                  <motion.div key={l.sku} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-5 px-5 py-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image} alt="" className="h-[84px] w-[84px] rounded-[12px] object-cover ring-1 ring-black/5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-medium text-[#111]">{p.name}</div>
                      <div className="mt-0.5 text-[12.5px] text-[#76766D]">{formatPence(p.pricePence)} each</div>
                      <div className="mt-1.5 flex gap-1.5">
                        {l.protection && <span className="inline-flex items-center gap-1 rounded-full bg-[#F3EEDD] px-2 py-0.5 text-[11px] text-[#6B5A2A]"><ShieldCheck size={11} />Protection Plan +£6</span>}
                        {l.giftwrap && <span className="inline-flex items-center gap-1 rounded-full bg-[#F3E6E6] px-2 py-0.5 text-[11px] text-[#7A3B3B]"><Gift size={11} />Gift wrap +£3</span>}
                      </div>
                    </div>
                    <div className="flex items-center rounded-full ring-1 ring-black/10">
                      <AgentEl semKey={`cart.dec:${l.sku}`}>
                        <button type="button" onClick={() => dispatch(`cart.dec:${l.sku}`)} className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-[#3B3B36] hover:bg-black/[0.05]"><Minus size={14} /></button>
                      </AgentEl>
                      <span className="w-7 text-center text-[14px] tabular-nums">{l.qty}</span>
                      <AgentEl semKey={`cart.inc:${l.sku}`}>
                        <button type="button" onClick={() => dispatch(`cart.inc:${l.sku}`)} className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-[#3B3B36] hover:bg-black/[0.05]"><Plus size={14} /></button>
                      </AgentEl>
                    </div>
                    <div className="w-[84px] text-right text-[15px] font-medium tabular-nums">{formatPence(p.pricePence * l.qty)}</div>
                    <AgentEl semKey={`cart.remove:${l.sku}`}>
                      <button type="button" onClick={() => dispatch(`cart.remove:${l.sku}`)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-[#9A9A90] hover:bg-black/[0.05] hover:text-[#111]"><X size={15} /></button>
                    </AgentEl>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </Card>
          <NewsletterBox />
        </div>
        <div>
          <Card className="sticky top-[120px] p-6">
            <Eyebrow>Order summary</Eyebrow>
            <div className="mt-4 space-y-2.5 text-[14px]">
              <div className="flex justify-between"><span className="text-[#55554E]">Subtotal</span><span className="tabular-nums">{formatPence(t.merchandise + t.extras)}</span></div>
              <div className="flex justify-between"><span className="text-[#55554E]">Delivery</span><span className="text-[#76766D]">Calculated at checkout</span></div>
            </div>
            <div className="my-5 h-px bg-black/[0.06]" />
            <AgentEl semKey="cart.checkout">
              <Btn size="lg" className="w-full" disabled={state.cart.length === 0} onClick={() => dispatch('cart.checkout')}>
                <Lock size={15} />{bySem.get('cart.checkout')?.label}
              </Btn>
            </AgentEl>
            <AgentEl semKey="cart.continueShopping">
              <a href="#" onClick={(e) => { e.preventDefault(); dispatch('cart.continueShopping'); }}
                className="mt-4 flex items-center justify-center gap-1.5 text-[13px] text-[#3B3B36] underline-offset-4 hover:underline">Continue shopping <ArrowRight size={13} /></a>
            </AgentEl>
            <div className="mt-6 flex items-center justify-center gap-3 text-[11px] text-[#9A9A90]">
              <span>VISA</span><span>Mastercard</span><span>Amex</span><span>Apple Pay</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

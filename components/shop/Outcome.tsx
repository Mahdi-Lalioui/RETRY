'use client';
import { ArrowLeft, Check, Store } from 'lucide-react';
import { motion } from 'motion/react';
import { AgentEl, useShop } from './ShopContext';
import { Card, Eyebrow } from './ui';
import { formatPence, getProduct } from '@/lib/shop/catalog';

export function Confirmation() {
  const { state } = useShop();
  const total = state.totalPence;
  return (
    <div className="mx-auto max-w-[640px] px-6 pb-24 pt-14 text-center">
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#1F3D2B] text-white shadow-[0_16px_40px_-14px_rgba(31,61,43,.8)]">
        <Check size={30} strokeWidth={2.4} />
      </motion.div>
      <h1 className="mt-6 text-[38px] font-medium tracking-[-0.035em] text-[#111]">Order confirmed</h1>
      {state.orderId ? (
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-[13.5px] ring-1 ring-black/10">
          <span className="text-[#76766D]">Order number</span><span className="font-mono font-medium tracking-[0.04em] text-[#111]">{state.orderId}</span>
        </div>
      ) : (
        <p className="mt-3 text-[14.5px] text-[#55554E]">Thank you — your order is being prepared</p>
      )}
      <Card className="mt-10 p-6 text-left">
        <Eyebrow>Your order</Eyebrow>
        <div className="mt-4 space-y-3">
          {state.cart.map((l) => {
            const p = getProduct(l.sku);
            return (
              <div key={l.sku} className="flex items-center gap-3 text-[14px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt="" className="h-11 w-11 rounded-[10px] object-cover" />
                <span className="flex-1">{p.name} × {l.qty}</span>
                <span className="tabular-nums">{formatPence(p.pricePence * l.qty)}</span>
              </div>
            );
          })}
        </div>
        <div className="my-5 h-px bg-black/[0.06]" />
        <div className="flex justify-between text-[15px] font-medium">
          <span>Total paid</span><span className="tabular-nums">{total === undefined ? '—' : formatPence(total)}</span>
        </div>
        {state.shipping === 'collect' && (
          <div className="mt-5 flex items-center gap-3 rounded-[12px] bg-[#F1F5F0] px-4 py-3 text-[13px] text-[#1F3D2B]">
            <Store size={16} /> Ready to collect from Night Market Shoreditch in about 2 hours.
          </div>
        )}
      </Card>
    </div>
  );
}

export function ErrorPage() {
  const { state, dispatch } = useShop();
  return (
    <div className="mx-auto max-w-[620px] px-6 pb-24 pt-20 text-center">
      <div className="text-[120px] font-medium leading-none tracking-[-0.06em] text-[#E4E0D4]">500</div>
      <h1 className="mt-2 text-[30px] font-medium tracking-[-0.03em] text-[#111]">Something went wrong (500)</h1>
      <p className="mt-3 text-[14.5px] text-[#55554E]">We hit an unexpected error while processing your request. Our team has been notified.</p>
      <code className="mt-6 inline-block rounded-[10px] bg-[#F1EEE6] px-4 py-2 font-mono text-[12px] text-[#7A3B3B]">{state.errorMessage ?? 'Internal Server Error'}</code>
      <div className="mt-8">
        <AgentEl semKey="error.home">
          <a href="#" onClick={(e) => { e.preventDefault(); dispatch('error.home'); }}
            className="inline-flex items-center gap-2 rounded-full bg-[#1F3D2B] px-6 py-3 text-[14px] font-medium text-white"><ArrowLeft size={15} />Back to home</a>
        </AgentEl>
      </div>
    </div>
  );
}

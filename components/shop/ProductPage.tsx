'use client';
import { ArrowLeft, ChevronDown, Leaf, Store, Truck } from 'lucide-react';
import { AgentEl, useShop } from './ShopContext';
import { Btn, Eyebrow } from './ui';
import { formatPence, getProduct } from '@/lib/shop/catalog';
import { getUi, QTY_OPTIONS } from '@/lib/shop/engine';

export function ProductPage() {
  const { state, dispatch, bySem } = useShop();
  const p = getProduct(state.currentSku ?? state.layout.productOrder[0]);
  const iconBack = state.layout.iconOnly.includes('product.back');
  const qty = getUi(state).productQty;
  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-24 pt-6">
      <AgentEl semKey="product.back">
        <button type="button" onClick={() => dispatch('product.back')}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-full text-[13px] text-[#3B3B36] transition hover:bg-black/[0.05] ${iconBack ? 'h-9 w-9 justify-center ring-1 ring-black/10' : 'h-9 px-3'}`}>
          <ArrowLeft size={16} />{!iconBack && 'Back to shop'}
        </button>
      </AgentEl>
      <div className="mt-4 grid grid-cols-[1.1fr_1fr] gap-14">
        <div className="overflow-hidden rounded-[18px] bg-[#EFEBE2] ring-1 ring-black/[0.05] shadow-[0_24px_60px_-34px_rgba(17,17,17,.45)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.image} alt={p.name} className="aspect-square w-full object-cover" />
        </div>
        <div className="pt-6">
          <Eyebrow>{p.tags.join(' · ')}</Eyebrow>
          <h1 className="mt-3 text-[40px] font-medium leading-[1.05] tracking-[-0.035em] text-[#111]">{p.name}</h1>
          <div className="mt-3 text-[20px] tabular-nums text-[#111]">{formatPence(p.pricePence)}</div>
          <p className="mt-5 max-w-[440px] text-[15px] leading-relaxed text-[#55554E]">{p.blurb}</p>
          <div className="mt-8 flex items-end gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[#6B6B63]">Quantity</span>
              <span className="relative block">
                <AgentEl semKey="product.qty">
                  <select value={String(qty)} onChange={(e) => dispatch('product.qty', e.target.value)}
                    className="h-[52px] w-[96px] cursor-pointer appearance-none rounded-full bg-white pl-5 pr-9 text-[15px] tabular-nums ring-1 ring-black/10 outline-none focus:ring-[#1F3D2B]">
                    {QTY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </AgentEl>
                <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#6B6B63]" />
              </span>
            </label>
            <AgentEl semKey="product.add">
              <Btn size="lg" className="flex-1" onClick={() => dispatch('product.add')}>{bySem.get('product.add')?.label} · {formatPence(p.pricePence * qty)}</Btn>
            </AgentEl>
          </div>
          <div className="mt-8 divide-y divide-black/[0.06] rounded-[14px] bg-white/70 ring-1 ring-black/[0.06]">
            {[
              { i: <Store size={16} />, t: 'Collect in store', d: 'Free · Ready in 2 hours at Shoreditch' },
              { i: <Truck size={16} />, t: 'UK delivery', d: 'From £3.95 · 2–3 working days' },
              { i: <Leaf size={16} />, t: 'Made responsibly', d: 'Independent studios · plastic-free packaging' },
            ].map((r) => (
              <div key={r.t} className="flex items-center gap-3 px-4 py-3.5 text-[13px]">
                <span className="text-[#1F3D2B]">{r.i}</span>
                <span className="font-medium text-[#111]">{r.t}</span>
                <span className="text-[#76766D]">{r.d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

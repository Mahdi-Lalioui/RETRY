'use client';
import { ArrowRight, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { AgentEl, useShop } from './ShopContext';
import { Btn, Eyebrow } from './ui';
import { formatPence, getProduct } from '@/lib/shop/catalog';

function ProductCard({ sku, index }: { sku: string; index: number }) {
  const { state, dispatch, bySem } = useShop();
  const p = getProduct(sku);
  const iconAdd = state.layout.iconOnly.includes('grid.add');
  const addLabel = bySem.get(`grid.add:${sku}`)?.label ?? 'Add';
  return (
    <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * index, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="group">
      <div className="relative overflow-hidden rounded-[14px] bg-[#EFEBE2] ring-1 ring-black/[0.05] shadow-[0_14px_34px_-22px_rgba(17,17,17,.35)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.image} alt="" className="aspect-[5/4] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {p.tags.slice(0, 1).map((t) => (
            <span key={t} className="rounded-full bg-white/80 px-2.5 py-1 text-[10.5px] font-medium tracking-[0.06em] text-[#3B3B36] backdrop-blur">{t}</span>
          ))}
        </div>
        {iconAdd && (
          <AgentEl semKey={`grid.add:${sku}`}>
            <button type="button" onClick={() => dispatch(`grid.add:${sku}`)}
              className="absolute bottom-3 right-3 grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-white text-[#1F3D2B] shadow-[0_8px_20px_-8px_rgba(0,0,0,.35)] ring-1 ring-black/5 transition hover:scale-105">
              <Plus size={18} strokeWidth={2.2} />
            </button>
          </AgentEl>
        )}
      </div>
      <div className="mt-3.5 flex items-start justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <AgentEl semKey={`grid.open:${sku}`}>
            <a href="#" onClick={(e) => { e.preventDefault(); dispatch(`grid.open:${sku}`); }}
              className="text-[15px] font-medium tracking-[-0.01em] text-[#111] underline-offset-4 hover:underline">{p.name}</a>
          </AgentEl>
          <p className="mt-0.5 line-clamp-1 text-[12.5px] text-[#76766D]">{p.blurb}</p>
        </div>
        <div className="text-[14px] font-medium tabular-nums text-[#111]">{formatPence(p.pricePence)}</div>
      </div>
      {!iconAdd && (
        <AgentEl semKey={`grid.add:${sku}`}>
          <Btn variant="secondary" size="sm" className="mt-3 w-full" onClick={() => dispatch(`grid.add:${sku}`)}>{addLabel}</Btn>
        </AgentEl>
      )}
    </motion.article>
  );
}

export function Home() {
  const { state } = useShop();
  return (
    <div>
      <section className="mx-auto mt-6 grid max-w-[1180px] grid-cols-[1.05fr_1fr] gap-6 px-6">
        <div className="relative overflow-hidden rounded-[18px] bg-[#1F3D2B] px-12 py-11 text-[#F2EEE2]">
          <svg className="absolute -right-16 -top-16 opacity-[0.12]" width="300" height="300" viewBox="0 0 24 24" aria-hidden>
            <path d="M15.5 2.6A9.6 9.6 0 1 0 21.4 15 7.6 7.6 0 0 1 15.5 2.6Z" fill="#F2EEE2" />
          </svg>
          <Eyebrow className="text-[#BFD0C2]">Autumn edit · No. 07</Eyebrow>
          <h1 className="mt-4 max-w-[420px] text-[44px] font-medium leading-[1.04] tracking-[-0.035em]">Objects for slow evenings</h1>
          <p className="mt-4 max-w-[380px] text-[14.5px] leading-relaxed text-[#C9D5CB]">Small-batch homeware and apparel, made by independent studios and built to be used every day.</p>
          <div className="mt-7 inline-flex items-center gap-2 text-[13.5px] font-medium text-[#F2EEE2]">Shop the collection <ArrowRight size={15} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/products/aurora-lamp.svg" alt="" className="h-full w-full rounded-[18px] object-cover" />
          <div className="grid grid-rows-2 gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/products/orbit-clock.svg" alt="" className="h-full w-full rounded-[18px] object-cover" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/products/moss-planter.svg" alt="" className="h-full w-full rounded-[18px] object-cover" />
          </div>
        </div>
      </section>
      <section className="mx-auto mt-12 max-w-[1180px] px-6 pb-24">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <Eyebrow>The collection</Eyebrow>
            <h2 className="mt-2 text-[26px] font-medium tracking-[-0.025em] text-[#111]">Six things we can&rsquo;t stop using</h2>
          </div>
          <div className="text-[13px] text-[#76766D]">{state.layout.productOrder.length} products · Free UK collection</div>
        </div>
        <div className="grid grid-cols-3 gap-x-6 gap-y-10">
          {state.layout.productOrder.map((sku, i) => <ProductCard key={sku} sku={sku} index={i} />)}
        </div>
      </section>
    </div>
  );
}

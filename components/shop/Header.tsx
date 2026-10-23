'use client';
import { Search, ShoppingBag } from 'lucide-react';
import { motion } from 'motion/react';
import { AgentEl, useShop } from './ShopContext';
import { Wordmark } from './Wordmark';
import { totals } from '@/lib/shop/engine';

function CartBadge({ n, dark }: { n: number; dark?: boolean }) {
  if (!n) return null;
  return (
    <motion.span key={n} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}
      className={`absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${dark ? 'bg-[#F2EBD9] text-[#1F3D2B]' : 'bg-[#1F3D2B] text-white'}`}>
      {n}
    </motion.span>
  );
}

export function Header() {
  const { state, dispatch } = useShop();
  const L = state.layout;
  const items = totals(state).items;
  const iconCart = L.iconOnly.includes('header.cart');
  return (
    <header className="sticky top-0 z-20">
      <div className="flex h-8 items-center justify-center bg-[#1F3D2B] text-[11.5px] tracking-[0.04em] text-[#E9E4D4]">
        Free collection from our Shoreditch store · Carbon-neutral delivery across the UK
      </div>
      <div className="border-b border-black/[0.06] bg-[#FAFAF7]/85 backdrop-blur-md">
        <div className="relative mx-auto flex h-[64px] max-w-[1180px] items-center justify-between px-6">
          <nav className="flex items-center gap-7 text-[13.5px] text-[#3B3B36]">
            <span>Shop</span><span>Objects</span><span>Apparel</span><span>Journal</span>
          </nav>
          <AgentEl semKey="header.home">
            <a href="#" onClick={(e) => { e.preventDefault(); dispatch('header.home'); }} className="absolute left-1/2 -translate-x-1/2">
              <Wordmark />
            </a>
          </AgentEl>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-[200px] items-center gap-2 rounded-full bg-black/[0.04] px-3.5 text-[13px] text-[#8A8A80]">
              <Search size={14} strokeWidth={2} /> Search objects
            </div>
            {L.cartPosition === 'header' && (
              <AgentEl semKey="header.cart">
                <button type="button" onClick={() => dispatch('header.cart')}
                  className="relative inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-[13.5px] font-medium text-[#111] transition hover:bg-black/[0.05]">
                  <ShoppingBag size={17} strokeWidth={1.8} />
                  {!iconCart && <span>Cart ({items})</span>}
                  {iconCart && <CartBadge n={items} />}
                </button>
              </AgentEl>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export function CartFloating() {
  const { state, dispatch } = useShop();
  if (state.layout.cartPosition !== 'floating') return null;
  const items = totals(state).items;
  const iconCart = state.layout.iconOnly.includes('header.cart');
  return (
    <AgentEl semKey="header.cart">
      <motion.button type="button" onClick={() => dispatch('header.cart')} whileHover={{ y: -2 }}
        className="absolute bottom-6 right-6 z-30 inline-flex h-14 cursor-pointer items-center gap-2.5 rounded-full bg-[#1F3D2B] pl-5 pr-6 text-[14px] font-medium text-[#F7F5EE] shadow-[0_18px_40px_-14px_rgba(31,61,43,.8),0_2px_6px_rgba(0,0,0,.12)]">
        <span className="relative"><ShoppingBag size={19} strokeWidth={1.8} />{iconCart && <CartBadge n={items} dark />}</span>
        {!iconCart && <span>Cart ({items})</span>}
      </motion.button>
    </AgentEl>
  );
}

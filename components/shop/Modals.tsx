'use client';
import { Cookie, Gift, ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AgentEl, useRegion, useShop } from './ShopContext';
import { Btn } from './ui';
import { getProduct } from '@/lib/shop/catalog';
import type { ModalId } from '@/lib/shop/state';

// Like many real stores, the option the house policy forbids gets the prominent styling.
const PROMINENT = new Set(['cookies.all', 'upsell.accept', 'giftwrap.accept']);

function ModalButtons({ modal }: { modal: ModalId }) {
  const { dispatch } = useShop();
  const buttons = useRegion(`modal:${modal}`, ['button']);
  return (
    <div className="mt-6 flex gap-3">
      {buttons.map((b) => (
        <AgentEl key={b.semKey} semKey={b.semKey}>
          <Btn className="flex-1" variant={PROMINENT.has(b.semKey) ? 'primary' : 'secondary'} onClick={() => dispatch(b.semKey)}>{b.label}</Btn>
        </AgentEl>
      ))}
    </div>
  );
}

function CookieSheet() {
  return (
    <motion.div role="dialog" aria-label="We value your privacy" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className="absolute bottom-6 left-6 w-[460px] rounded-[18px] bg-white p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,.45)] ring-1 ring-black/[0.06]">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#F3EEDD] text-[#8A6A2E]"><Cookie size={19} /></span>
        <h2 className="text-[17px] font-medium tracking-[-0.01em] text-[#111]">We value your privacy</h2>
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-[#55554E]">
        We use cookies to keep the store running, and — with your permission — to measure traffic and personalise what you see.
      </p>
      <ModalButtons modal="cookies" />
    </motion.div>
  );
}

function Dialog({ modal, icon, title, children }: { modal: ModalId; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <motion.div role="dialog" aria-modal="true" aria-label={title} initial={{ scale: 0.94, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className="w-[480px] rounded-[20px] bg-white p-7 shadow-[0_40px_100px_-30px_rgba(0,0,0,.5)] ring-1 ring-black/[0.06]">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-[#EAF0E9] text-[#1F3D2B]">{icon}</span>
      <h2 className="mt-5 text-[22px] font-medium tracking-[-0.025em] text-[#111]">{title}</h2>
      {children}
      <ModalButtons modal={modal} />
    </motion.div>
  );
}

export function Modals() {
  const { state } = useShop();
  const top = state.openModals[0];
  const sku = state.currentSku ?? state.cart[state.cart.length - 1]?.sku;
  const name = sku ? getProduct(sku).name : 'your item';
  return (
    <AnimatePresence>
      {top && (
        <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: "none" }} transition={{ duration: 0.2 }}
          className={`absolute inset-0 z-40 ${top === 'cookies' ? 'bg-black/10' : 'grid place-items-center bg-[#111]/45'}`}>
          <AnimatePresence mode="wait">
            {top === 'cookies' && <CookieSheet key="cookies" />}
            {top === 'upsell' && (
              <Dialog key="upsell" modal="upsell" icon={<ShieldCheck size={22} />} title="Protect your purchase?">
                <p className="mt-2 text-[14px] leading-relaxed text-[#55554E]">Add 2 years of accidental damage cover to your {name}. Claims handled in 48 hours, no questions asked.</p>
                <ul className="mt-4 space-y-1.5 text-[13px] text-[#3B3B36]">
                  <li>✓ Drops, spills and cracks covered</li><li>✓ Free replacement shipping</li>
                </ul>
              </Dialog>
            )}
            {top === 'giftwrap' && (
              <Dialog key="giftwrap" modal="giftwrap" icon={<Gift size={22} />} title="Make it a gift?">
                <p className="mt-2 text-[14px] leading-relaxed text-[#55554E]">We&rsquo;ll wrap your {name} in recycled kraft paper with a hand-tied ribbon and a blank card.</p>
              </Dialog>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

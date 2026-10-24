'use client';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { BugId, ShopState } from '@/lib/shop/state';
import { applyAction, elements, getUi, initialState } from '@/lib/shop/engine';
import { TASKS } from '@/lib/shop/tasks';

const collectFor = (taskId?: string) => !!TASKS.find((t) => t.id === taskId)?.wantsCollect;
import { installBridge, post } from '@/lib/shop/bridge';
import { ShopContext, type ShopCtx } from './ShopContext';
import { CartFloating, Header } from './Header';
import { Home } from './Home';
import { ProductPage } from './ProductPage';
import { CartView } from './CartView';
import { Checkout } from './Checkout';
import { Confirmation, ErrorPage } from './Outcome';
import { Modals } from './Modals';
import { Moon } from './Wordmark';

type Act = { type: 'set'; state: ShopState };
const reducer = (_: ShopState, a: Act): ShopState => a.state;

interface Hover { x: number; y: number; w: number; h: number; chip: string }

export function ShopShell({ seed, versionIndex, bugs, taskId }: { seed: number; versionIndex: number; bugs: BugId[]; taskId?: string }) {
  const [state, set] = useReducer(reducer, undefined, () => initialState(seed, versionIndex, bugs, { collectRequired: collectFor(taskId) }));
  const stateRef = useRef(state);
  const [highlight, setHighlight] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const commit = useCallback((s: ShopState) => {
    stateRef.current = s;
    set({ type: 'set', state: s });
  }, []);

  useEffect(() => {
    return installBridge({
      getState: () => stateRef.current,
      setState: commit,
      setHighlight: (on) => { setHighlight(on); if (!on) setHover(null); },
      reset: (sd, v, b, tid) => {
        // No taskId → same task as before: keep the current order's collect-in-store requirement.
        const req = tid !== undefined ? collectFor(tid) : !!getUi(stateRef.current).collectRequired;
        const s = initialState(sd, v, b, { collectRequired: req }); commit(s); scrollRef.current?.scrollTo({ top: 0 }); return s; },
      scrollRoot: () => scrollRef.current,
    });
  }, [commit]);

  // Scroll to top on page change.
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }, [state.page, state.currentSku]);

  const dispatch = useCallback((semKey: string, value?: string) => {
    const r = applyAction(stateRef.current, semKey, value);
    if (r.effect === 'ok') {
      commit(r.state);
      post({ type: 'retry:state', state: r.state, layoutTag: r.state.layout.layoutTag });
    }
  }, [commit]);

  const ctx = useMemo<ShopCtx>(() => {
    const els = elements(state);
    return { state, els, bySem: new Map(els.map((e) => [e.semKey, e])), dispatch, highlight };
  }, [state, dispatch, highlight]);

  const onMove = (e: React.MouseEvent) => {
    if (!highlight) return;
    const el = (e.target as HTMLElement).closest('[data-agent-id]') as HTMLElement | null;
    const root = rootRef.current;
    if (!el || !root) { setHover(null); return; }
    const r = el.getBoundingClientRect(); const o = root.getBoundingClientRect();
    setHover({ x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height, chip: el.dataset.chip ?? el.dataset.agentId! });
  };

  const L = state.layout;
  const pageKey = `${state.page}:${state.currentSku ?? ''}`;
  return (
    <ShopContext.Provider value={ctx}>
      <div ref={rootRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)} data-highlight={highlight || undefined}
        className="relative h-[800px] w-[1280px] overflow-hidden bg-[#FAFAF7] text-[#111] antialiased"
        style={{ fontFamily: 'var(--font-geist-sans), Inter, ui-sans-serif, system-ui, sans-serif', cursor: highlight ? 'crosshair' : undefined }}>
        <AnimatePresence initial={false}>
          <motion.div key={`${L.layoutTag}:${L.seed}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
            className="absolute inset-0">
            <div ref={scrollRef} onScroll={() => hover && setHover(null)} className="shop-scroll h-full overflow-y-auto overflow-x-hidden">
              <Header />
              <AnimatePresence mode="wait" initial={false}>
                <motion.main key={pageKey} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
                  {state.page === 'home' && <Home />}
                  {state.page === 'product' && <ProductPage />}
                  {state.page === 'cart' && <CartView />}
                  {state.page === 'checkout' && <Checkout />}
                  {state.page === 'confirmation' && <Confirmation />}
                  {state.page === 'error' && <ErrorPage />}
                </motion.main>
              </AnimatePresence>
              <footer className="border-t border-black/[0.06] bg-[#F3F1EA]">
                <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-8 text-[12px] text-[#76766D]">
                  <span className="inline-flex items-center gap-2"><Moon size={14} /> Night Market Ltd · 14 Redchurch St, London E2</span>
                  <span>Shipping · Returns · Stores · Contact</span>
                </div>
              </footer>
            </div>
            <CartFloating />
            <Modals />
          </motion.div>
        </AnimatePresence>
        {highlight && hover && (
          <div className="pointer-events-none absolute z-50 rounded-[10px] ring-2 ring-[#F59E0B] shadow-[0_0_0_4px_rgba(245,158,11,.25)] transition-all duration-100"
            style={{ left: hover.x - 3, top: hover.y - 3, width: hover.w + 6, height: hover.h + 6 }}>
            <span className="absolute -top-7 left-0 whitespace-nowrap rounded-md bg-[#F59E0B] px-2 py-1 font-mono text-[11px] font-medium text-[#1A1205] shadow">
              {hover.chip}
            </span>
          </div>
        )}
        {highlight && <div className="pointer-events-none absolute inset-0 z-40 ring-4 ring-inset ring-[#F59E0B]/60" />}
      </div>
    </ShopContext.Provider>
  );
}

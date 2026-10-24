'use client';
// "How Mubit is used" explainer (hotkey ?). Only claims that are true in this app (plan §11.5).
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { GitBranch, Hand, Route, ShieldCheck, X } from 'lucide-react';
import { useMission } from '@/lib/store/mission';
import { Kbd } from '@/components/ui/Kbd';

const STEPS = [
  { icon: Route, color: '#FF4500', title: 'Route every call', body: 'Live next-action decisions use the configured Mubit endpoint. Mock mode simulates the same decisions for rehearsal.', stat: (s: Stats) => `${s.calls.toLocaleString('en-GB')} decisions this session` },
  { icon: Hand, color: '#F59E0B', title: 'Capture the rescue', body: 'When a lane breaks a house rule or gets stuck, a human chooses the right action. The exact training pair is saved and queued for delivery. The ledger shows its delivery status.', stat: (s: Stats) => `${s.rescues} rescues · ${s.examples.toLocaleString('en-GB')} examples` },
  { icon: GitBranch, color: '#22D3EE', title: 'Versioned update', body: 'The version lifecycle runs in mock mode. Live updates require confirmed feedback, training and adapter-serving APIs; public Mubit compares adapters in its console.', stat: (s: Stats) => `RETRY version ${s.label}` },
  { icon: ShieldCheck, color: '#34D399', title: 'Gate on held-out eval', body: 'Before promotion each version runs 48 held-out checkouts on seeds never used in training (16 with real bugs). It is promoted only if success and bug recall don’t drop.', stat: () => '48 held-out runs · disjoint seeds' },
];
interface Stats { calls: number; rescues: number; examples: number; label: string }

export function HowMubit() {
  const [open, setOpen] = useState(false);
  const calls = useMission((s) => s.calls);
  const counts = useMission((s) => s.counts);
  const label = useMission((s) => s.adapted.label);
  const mock = useMission((s) => s.health.mubit === 'mock');
  const hybrid = useMission((s) => s.health.mubit === 'mock' && (s.health.liveLanes ?? []).includes('closed'));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopImmediatePropagation(); setOpen(false); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('retry:how', onOpen);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('retry:how', onOpen); };
  }, [open]);
  const stats: Stats = { calls, rescues: counts.rescues, examples: counts.examples, label };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#05060A] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
          <div className="how-grid pointer-events-none absolute inset-0" />
          <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: 24, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 26 }}
            className="relative w-full max-w-[1500px]">
            <div className="flex items-end gap-4">
              <div>
                <div className="font-mono text-[13px] font-semibold uppercase tracking-[0.22em] text-mubit">How RETRY uses Mubit</div>
                <h2 className="mt-2 text-[clamp(28px,3.2vw,52px)] font-bold leading-[1.05] tracking-[-0.03em] text-white">Every call through Mubit.<br /><span className="text-learn">Every rescue a model update.</span></h2>
              </div>
              <button onClick={() => setOpen(false)} className="ml-auto flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-[13px] text-white/80 hover:bg-white/5"><X className="h-4 w-4" /> close <Kbd>Esc</Kbd></button>
            </div>
            <p className="mt-4 text-[14px] text-rescue">{hybrid ? 'GPT LANE LIVE · its calls go through api.mubit.ai for real (request ids in the step log). Open-model lanes, training and benchmark results are simulated.'
              : mock ? 'MOCK REHEARSAL · Model calls, training and benchmark results are simulated.' : 'Live inference uses Mubit. Adapter training and serving require a confirmed integration.'}</p>
            <div className="relative mt-8 grid grid-cols-4 gap-5">
              {/* connecting beam */}
              <div className="how-beam pointer-events-none absolute left-[6%] right-[6%] top-[58px] h-[2px]" />
              {STEPS.map((st, i) => (
                <motion.div key={st.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.12, type: 'spring', stiffness: 220, damping: 24 }}
                  className="relative flex flex-col rounded-[16px] border bg-[#0D1016] p-5 2xl:p-6" style={{ borderColor: `${st.color}55`, boxShadow: `0 0 60px -30px ${st.color}, inset 0 1px 0 #ffffff0a` }}>
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center">
                      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
                        <polygon points="50,4 90,27 90,73 50,96 10,73 10,27" fill={`${st.color}1f`} stroke={st.color} strokeWidth="2" />
                        <polygon points="50,18 78,34 78,66 50,82 22,66 22,34" fill="none" stroke={st.color} strokeOpacity=".35" strokeWidth="1.5" />
                      </svg>
                      <st.icon className="relative h-7 w-7" style={{ color: st.color }} />
                    </span>
                    <span className="font-mono text-[44px] font-bold leading-none text-white/10">{i + 1}</span>
                  </div>
                  <div className="mt-4 text-[clamp(18px,1.5vw,26px)] font-semibold tracking-[-0.02em] text-white">{st.title}</div>
                  <p className="mt-2 text-[clamp(13px,1vw,16px)] leading-[1.5] text-[#B8C1CE]">{st.body}</p>
                  <div className="mt-auto pt-4">
                    <span className="inline-flex rounded-md border px-2 py-1 font-mono text-[12.5px]" style={{ color: st.color, borderColor: `${st.color}44`, background: `${st.color}10` }}>{st.stat(stats)}</span>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[#9AA4B4]">
              <span>Audit every training pair in <a href="/corrections" className="text-white underline decoration-white/30">/corrections</a></span>
              <span>Versions, held-out matrix and rollback in <a href="/lab" className="text-white underline decoration-white/30">/lab</a></span>
              <span className="ml-auto flex items-center gap-1.5">Press <Kbd>?</Kbd> any time</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

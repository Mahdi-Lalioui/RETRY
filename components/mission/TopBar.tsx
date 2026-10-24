'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useMission } from '@/lib/store/mission';
import { getTask } from '@/lib/shop/tasks';
import { Tooltip } from '@/components/ui/Tooltip';

export function RetryGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id="rg-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="url(#rg-g)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M20.5 3.5v4.2h-4.2" stroke="url(#rg-g)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.2" fill="#FF4500" />
    </svg>
  );
}

function Clock() {
  const [t, setT] = useState<string>('');
  useEffect(() => {
    const f = () => setT(new Date().toLocaleTimeString('en-GB', { hour12: false }));
    f();
    const id = setInterval(f, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tnum font-mono text-[13px] text-white/70">{t || '––:––:––'}</span>;
}

function MubitPill() {
  const health = useMission((s) => s.health);
  const mode = health.mubit;
  const live = health.liveLanes ?? [];
  const cfg =
    mode === 'mock' && live.length ? { dot: '#34D399', text: `${live.includes('closed') ? 'GPT' : live.join(' + ')} LIVE VIA MUBIT`, sub: 'real interactive calls through api.mubit.ai for this lane · held-out scores, open-model lanes and the learning loop are simulated (MOCK)', cls: 'border-pass/40 bg-pass/10 text-pass' }
    : mode === 'mock' ? { dot: '#FACC15', text: 'MOCK MODE', sub: 'mock model client · not real Mubit', cls: 'border-yellow-400/40 bg-yellow-400/10 text-yellow-300' }
      : mode === 'down' ? { dot: '#F43F5E', text: 'MUBIT UNREACHABLE', sub: 'check /api/health', cls: 'border-fail/40 bg-fail/10 text-fail' }
        : mode === 'ok' ? { dot: '#34D399', text: 'Mubit configured', sub: 'live requests use Mubit; model and adapter availability depend on the configured integration', cls: 'border-white/10 bg-white/[0.04] text-white/80' }
          : { dot: '#7A8597', text: 'connecting…', sub: '', cls: 'border-white/10 bg-white/[0.03] text-white/50' };
  return (
    <Tooltip label={cfg.sub} side="bottom">
      <span className={`inline-flex h-7 items-center gap-2 rounded-full border px-3 text-[12px] font-medium ${cfg.cls}`}>
        <span className="relative flex h-2 w-2">
          <span className="absolute inset-0 rounded-full opacity-60 animate-ping" style={{ background: cfg.dot, animationDuration: '2s' }} />
          <span className="relative h-2 w-2 rounded-full" style={{ background: cfg.dot, boxShadow: `0 0 8px ${cfg.dot}` }} />
        </span>
        <span className={`whitespace-nowrap ${(mode === 'mock' && !live.length) || mode === 'down' ? 'font-mono tracking-wider' : ''}`}>{cfg.text}</span>
      </span>
    </Tooltip>
  );
}

export function TopBar() {
  const taskId = useMission((s) => s.taskId);
  const layoutTag = useMission((s) => s.layoutTag);
  const flash = useMission((s) => s.layoutFlash);
  const seed = useMission((s) => s.seed);
  const bugs = useMission((s) => s.bugs);
  const task = getTask(taskId);
  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-4 border-b border-white/[0.06] bg-[#07080B]/70 px-4 backdrop-blur-md 2xl:h-14 2xl:px-6">
      <div className="flex items-center gap-2.5">
        <RetryGlyph />
        <span className="text-[19px] font-bold tracking-[-0.02em] text-white 2xl:text-[21px]">RETRY</span>
        <span className="hidden whitespace-nowrap rounded-[5px] 2xl:inline border border-rescue/40 bg-rescue/10 px-1.5 py-[1px] font-mono text-[10.5px] font-semibold tracking-[0.16em] text-rescue">NIGHT SHIFT</span>
        <nav className="ml-2 flex items-center gap-0.5 text-[12.5px] 2xl:text-[13px]">
          <span className="whitespace-nowrap rounded-md bg-white/[0.07] px-2 py-1 text-white">Mission Control</span>
          {[['/lab', 'Lab'], ['/corrections', 'Corrections'], ['/attract', 'Attract']].map(([h, l]) => (
            <a key={h} href={h} className="whitespace-nowrap rounded-md px-2 py-1 text-[#9AA4B4] transition-colors hover:bg-white/[0.05] hover:text-white">{l}</a>
          ))}
          <button onClick={() => window.dispatchEvent(new Event('retry:how'))} className="ml-1 flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-mubit/40 px-2 py-[3px] text-[12px] text-[#FF8A5B] hover:bg-mubit/10">
            <span className="hidden 2xl:inline">How Mubit is used</span><span className="2xl:hidden">Mubit</span> <kbd className="rounded border border-mubit/40 px-1 font-mono text-[10.5px]">?</kbd>
          </button>
        </nav>
      </div>

      <div className="mx-auto flex min-w-0 items-center gap-2">
        <span className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] py-1 pl-1 pr-3 shadow-[inset_0_1px_0_#ffffff0a]">
          <span className="rounded-full bg-white/[0.08] px-2 py-[1px] font-mono text-[11px] font-semibold text-white">{task.id}</span>
          <span className="truncate text-[12.5px] text-white/85 2xl:text-[13.5px]">{task.goal}</span>
        </span>
        <motion.span
          key={flash}
          initial={flash ? { backgroundColor: '#22D3EE55', color: '#ffffff', borderColor: '#22D3EE' } : false}
          animate={{ backgroundColor: '#22D3EE0d', color: '#22D3EE', borderColor: '#22D3EE40' }}
          transition={{ duration: 1.2 }}
          className="shrink-0 rounded-md border px-2 py-[3px] font-mono text-[11px]"
        >
          {layoutTag}
        </motion.span>
        <span data-dev className="hidden shrink-0 font-mono text-[11px] text-faint lg:inline">seed {seed}</span>
        <AnimatePresence>
          {bugs.length > 0 && (
            <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
              className="shrink-0 rounded-md border border-fail/50 bg-fail/15 px-2 py-[3px] font-mono text-[11px] text-fail">
              ✕ {bugs[0]}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3">
        <MubitPill />
        <span data-dev><Clock /></span>
      </div>
    </header>
  );
}

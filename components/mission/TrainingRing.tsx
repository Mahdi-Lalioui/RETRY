'use client';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useMission } from '@/lib/store/mission';
import { REFRESH_MIN_EXAMPLES } from '@/lib/store/lanes';
import { trainNow } from '@/lib/agent/loop';
import { Kbd } from '@/components/ui/Kbd';

const R = 76;
const C = 2 * Math.PI * R;
const R2 = 62;
const C2 = 2 * Math.PI * R2;

function fmtDur(s: number) { const m = Math.floor(s / 60); return `${m}m ${String(Math.round(s % 60)).padStart(2, '0')}s`; }

export function TrainingRing() {
  const training = useMission((s) => s.training);
  const counts = useMission((s) => s.counts);
  const adapted = useMission((s) => s.adapted);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (training.phase !== 'training' && training.phase !== 'evaluating') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [training.phase]);

  const phase = training.phase;
  const collect = Math.min(1, counts.sinceVersion / REFRESH_MIN_EXAMPLES);
  const outer = phase === 'collecting' ? collect : phase === 'ready' ? 1 : phase === 'training' ? training.progress : 1;
  const inner = phase === 'evaluating' ? training.progress : phase === 'promoted' ? 1 : 0;
  const elapsed = training.startedAt ? (now - training.startedAt) / 1000 : 0;
  const color = phase === 'held_back' ? '#F43F5E' : phase === 'collecting' ? '#F59E0B' : '#22D3EE';

  const status =
    phase === 'collecting' ? <>Collecting · <span className="tnum">{Math.min(counts.sinceVersion, REFRESH_MIN_EXAMPLES)}/{REFRESH_MIN_EXAMPLES}</span></>
      : phase === 'ready' ? <span className="text-learn">Ready to refresh</span>
        : phase === 'training' ? <>Mubit building update… <span className="tnum">{Math.round(training.progress * 100)}%</span></>
          : phase === 'evaluating' ? <>Evaluating on 48 held-out runs…</>
            : phase === 'promoted' ? <span className="text-pass">Promoted ✓</span>
              : <span className="text-fail">Held back ✕</span>;

  return (
    <section className="panel relative flex min-h-0 min-w-0 items-center gap-3 overflow-hidden p-3">
      <div className="pointer-events-none absolute left-3 top-3 panel-label">Training ring</div>
      <div className="relative aspect-square h-full max-h-[200px] min-h-0 shrink-0 pt-3">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90 overflow-visible">
          <defs>
            <filter id="ringglow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" /></filter>
          </defs>
          <circle cx="90" cy="90" r={R} fill="none" stroke="#3A4352" strokeOpacity="0.55" strokeWidth="8" />
          {Array.from({ length: 40 }, (_, i) => (
            <line key={i} x1="90" y1="4" x2="90" y2={i % 5 ? 8 : 10} stroke="#ffffff" strokeOpacity={i % 5 ? 0.06 : 0.14} transform={`rotate(${i * 9} 90 90)`} />
          ))}
          <motion.circle cx="90" cy="90" r={R} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" filter="url(#ringglow)" opacity={0.6}
            strokeDasharray={C} initial={false} animate={{ strokeDashoffset: C * (1 - outer) }} transition={{ type: 'spring', stiffness: 60, damping: 20 }} />
          <motion.circle cx="90" cy="90" r={R} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={C} initial={false} animate={{ strokeDashoffset: C * (1 - outer) }} transition={{ type: 'spring', stiffness: 60, damping: 20 }} />
          <circle cx="90" cy="90" r={R2} fill="none" stroke="#3A4352" strokeOpacity={inner > 0 || phase === 'evaluating' ? 0.4 : 0} strokeWidth="4" />
          <motion.circle cx="90" cy="90" r={R2} fill="none" stroke="#34D399" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={C2} initial={false} animate={{ strokeDashoffset: C2 * (1 - inner) }} transition={{ type: 'spring', stiffness: 60, damping: 20 }} />
        </svg>
        {phase === 'ready' && <div className="pointer-events-none absolute inset-[14%] top-[calc(14%+6px)] rounded-full animate-pulse-slow" style={{ boxShadow: '0 0 40px 6px #22D3EE55' }} />}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">RETRY</span>
          <span className="tnum font-mono text-[30px] font-semibold leading-none text-white 2xl:text-[40px]" style={{ textShadow: '0 0 20px #22D3EE55' }}>{adapted.label}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 pt-3">
        <div className="whitespace-nowrap text-[13px] font-medium text-white 2xl:text-[15px]">{status}</div>
        {(phase === 'training' || phase === 'evaluating') && (
          <div className="font-mono text-[11px] text-muted">elapsed <span className="tnum text-white/80">{fmtDur(elapsed)}</span> <span className="text-faint">· est. ~2m</span></div>
        )}
        {phase === 'held_back' && <div className="text-[11px] text-fail/80">{training.reason ?? 'regression on bug detection'} — previous version kept</div>}
        <div className="font-mono text-[11px] leading-tight text-muted">
          trained on <span className="tnum text-white/85">{(adapted.examples ?? counts.examples).toLocaleString('en-GB')}</span> examples
          {training.trainSeconds ? <> · <span className="tnum text-white/85">{fmtDur(training.trainSeconds)}</span></> : null}
        </div>
        <button
          onClick={() => void trainNow()}
          disabled={phase === 'training' || phase === 'evaluating'}
          className="mt-0.5 inline-flex h-7 w-fit shrink-0 items-center whitespace-nowrap gap-1.5 rounded-md border px-2 text-[11.5px] font-medium transition-colors disabled:opacity-40"
          style={{ borderColor: phase === 'ready' ? '#22D3EE' : '#ffffff1a', color: phase === 'ready' ? '#22D3EE' : '#cbd5e1', background: phase === 'ready' ? '#22D3EE14' : 'transparent', boxShadow: phase === 'ready' ? '0 0 20px -4px #22D3EE88' : 'none' }}
        >
          ⟳ Train now <Kbd>T</Kbd>
        </button>
        <div className="caption hidden 2xl:block">Mubit builds a versioned update; promoted only if it beats {adapted.label} on held-out runs</div>
      </div>
    </section>
  );
}

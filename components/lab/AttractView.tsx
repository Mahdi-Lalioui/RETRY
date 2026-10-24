'use client';
// plan §15 /attract — fullscreen expo loop. Every 45s: a judge's turn on an unseen seed (≥10000), RETRY vs GPT,
// every third loop with a real bug injected. Runs are simulated server-side through the same Mubit client and replayed
// action-by-action in two real shop iframes.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { AgentAction, Verdict } from '@/lib/agent/types';
import type { BugId } from '@/lib/shop/state';
import { TASKS } from '@/lib/shop/tasks';
import { BUGS } from '@/lib/shop/bugs';
import Link from 'next/link';
import { ShopViewport } from './ShopViewport';
import type { ShopFrame } from './shopFrame';
import { Wordmark } from './Shell';
import { actionText } from './ui';
import { normalizeMetrics } from '@/lib/agent/loop';
import { fmt } from '@/components/mission/Scoreboard';

const LOOP_MS = 45_000;
type LaneKey = 'closed' | 'adapted';
interface LaneRun { verdict: Verdict; steps: { action: AgentAction; result: string; latencyMs: number; costUsd: number | null }[]; layoutTag: string }
interface Turn { seed: number; taskId: string; goal: string; bugs: BugId[]; version: string; mode: string; closed: LaneRun; adapted: LaneRun }
interface LaneLive { step: number; action?: AgentAction; latency: number[]; cost: number; verdict?: Verdict }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BUG_ROTATION: { bug: BugId; tasks: string[] }[] = [
  { bug: 'total_nan', tasks: ['T1', 'T5', 'T9'] }, { bug: 'coupon_500', tasks: ['T2', 'T6', 'T11'] },
  { bug: 'pay_button_dead', tasks: ['T3', 'T7', 'T10'] }, { bug: 'no_order_id', tasks: ['T4', 'T12', 'T1'] },
];

function rnd(n: number) { return Math.floor(Math.random() * n); }

export function AttractView() {
  const frames = useRef<Record<LaneKey, ShopFrame | null>>({ closed: null, adapted: null });
  const [turn, setTurn] = useState<Turn | null>(null);
  const [live, setLive] = useState<Record<LaneKey, LaneLive>>({ closed: { step: 0, latency: [], cost: 0 }, adapted: { step: 0, latency: [], cost: 0 } });
  const [caption, setCaption] = useState<{ big: string; small: string }>({ big: 'RETRY', small: 'The AI QA tester that learns your rules from every rescue.' });
  const [loop, setLoop] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [calls, setCalls] = useState(0);
  const [ticker, setTicker] = useState<string[]>([]);

  // Live held-out scoreboard for the ticker — real /api/metrics numbers only, refreshed each loop.
  useEffect(() => {
    let dead = false;
    fetch('/api/metrics?scope=heldout').then((x) => x.json()).then((r) => {
      if (dead || !r?.ok) return;
      const { rows } = normalizeMetrics(r.data.rows ?? [], r.data.curve ?? []);
      const cur = r.data.totals?.currentVersion ?? '';
      const lanes: [string, string][] = [['closed', 'GPT'], ['base', 'Base v1'], ['adapted', `RETRY ${cur}`]];
      setTicker(rows.filter((row) => !/prompt/i.test(row.label)).map((row) => `${row.label}:  ${lanes.map(([l, n]) => `${n} ${fmt(row.values[l as 'closed'], row.unit)}`).join('  ·  ')}`));
    }).catch(() => {});
    return () => { dead = true; };
  }, [loop]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await sleep(1200);
      for (let n = 1; !cancelled; n++) {
        const t0 = Date.now();
        try { await playTurn(n, () => cancelled); setErr(null); } catch (e) { setErr((e as Error).message); }
        setLoop(n);
        const rest = Math.max(4000, LOOP_MS - (Date.now() - t0));
        await sleep(rest);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function playTurn(n: number, cancelled: () => boolean) {
    const bugTurn = n % 3 === 0;
    let taskId = TASKS[rnd(TASKS.length)].id; let bugs: BugId[] = [];
    if (bugTurn) { const b = BUG_ROTATION[rnd(BUG_ROTATION.length)]; bugs = [b.bug]; taskId = b.tasks[rnd(b.tasks.length)]; }
    const seed = 10000 + rnd(80000);
    const versionIndex = 2 + rnd(4);
    setCaption({ big: 'Judge’s turn', small: `Unseen seed ${seed} · new layout · rolling the dice…` });
    const r = await fetch('/api/attract/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seed, taskId, bugs: bugs.join(','), versionIndex }) }).then((x) => x.json());
    if (!r.ok) throw new Error(r.error);
    const t: Turn = { seed, taskId, goal: r.data.task.goal, bugs, version: r.data.version, mode: r.data.mode, closed: r.data.closed, adapted: r.data.adapted };
    setTurn(t);
    setLive({ closed: { step: 0, latency: [], cost: 0 }, adapted: { step: 0, latency: [], cost: 0 } });
    await Promise.all((['closed', 'adapted'] as const).map((k) => frames.current[k]?.boot(seed, versionIndex, bugs, taskId)));
    setCaption({ big: `Unseen layout · RETRY ${t.version} vs GPT`, small: `${t.taskId} · ${t.goal}${bugs[0] ? `  ·  checkout secretly broken: ${BUGS[bugs[0]].title}` : ''}` });
    await sleep(1500);
    await Promise.all((['closed', 'adapted'] as const).map(async (k) => {
      const f = frames.current[k]; const run = t[k];
      for (let i = 0; i < run.steps.length && !cancelled(); i++) {
        const s = run.steps[i];
        await sleep(Math.min(1800, s.latencyMs));
        setCalls((c) => c + 1);
        setLive((L) => ({ ...L, [k]: { ...L[k], step: i + 1, action: s.action, latency: [...L[k].latency, s.latencyMs], cost: L[k].cost + (s.costUsd ?? 0) } }));
        if (f && s.action.type !== 'done' && s.action.type !== 'report_bug') { try { await f.act(s.action); } catch { /* keep going */ } }
      }
      setLive((L) => ({ ...L, [k]: { ...L[k], verdict: run.verdict } }));
    }));
    const a = t.adapted.verdict;
    setCaption(a.status === 'bug_reported'
      ? { big: 'BUG REPORTED', small: `RETRY ${t.version} caught a real regression: ${a.reason.replace('Correctly reported: ', '')}` }
      : a.correct ? { big: `RETRY ${t.version} passes the unseen layout`, small: 'House rules learned from human rescues — through Mubit.' }
        : { big: `RETRY ${t.version}: ${a.status.replace('_', ' ')}`, small: a.reason });
  }

  // Esc / Backspace leaves the expo loop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Backspace') window.location.href = '/'; };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const bigColor = caption.big === 'BUG REPORTED' ? '#F43F5E' : /passes/.test(caption.big) ? '#34D399' : undefined;

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden px-[clamp(16px,2vw,40px)] pb-0 pt-[clamp(10px,1.6vh,24px)]">
      <div className="flex shrink-0 items-center gap-4">
        <Wordmark size={26} />
        <span className="rounded-md border border-[#F59E0B55] bg-[#F59E0B14] px-2 py-0.5 text-[12px] font-semibold tracking-[0.14em] text-[#FCD34D]">NIGHT SHIFT</span>
        <span className="hidden text-[15px] muted xl:inline">Self-healing tools guess. RETRY learns your rules from every rescue.</span>
        <MubitCounter calls={calls} />
        <span className="mono hidden text-[12px] muted 2xl:inline">{turn ? `seed ${turn.seed} · ${turn.closed.layoutTag}` : ''}{turn?.mode === 'mock' ? ' · mock model' : ''} · loop {loop}</span>
        <Link href="/" className="rounded-md border border-white/15 px-2.5 py-1 text-[13px] text-white/80 hover:bg-white/[0.06]">✕ Exit <span className="mono ml-1 rounded border border-white/20 px-1 text-[11px]">Esc</span></Link>
      </div>
      <div className="mt-[clamp(8px,1.4vh,20px)] flex shrink-0 justify-center gap-[clamp(12px,1.4vw,28px)]">
        {(['closed', 'adapted'] as const).map((k) => {
          const color = k === 'closed' ? '#94A3B8' : '#22D3EE';
          const L = live[k];
          const p50 = L.latency.length ? [...L.latency].sort((a, b) => a - b)[Math.floor(L.latency.length / 2)] : null;
          return (
            <div key={k} className="panel relative flex min-w-0 flex-col p-3" style={{ borderColor: `${color}55`, width: 'min(calc(50vw - 40px), calc((100vh - 300px) * 1.6 + 24px))' }}>
              <div className="mb-2 flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
                <span className="whitespace-nowrap text-[clamp(16px,1.1vw,22px)] font-semibold">{k === 'closed' ? 'GPT · closed' : `RETRY · open ${turn?.version ?? ''}`}</span>
                <span className="mono ml-auto truncate text-[clamp(12px,0.75vw,15px)] muted">steps {L.step} · {p50 ?? '—'}ms · {k === 'closed' ? `$${L.cost.toFixed(4)}` : 'credits'}</span>
              </div>
              <div className="relative">
                <ShopViewport src={`/shop/10001?lane=${k}&v=2`} color={color} onFrame={(f) => { frames.current[k] = f; }} />
                <AnimatePresence>
                  {L.verdict && (
                    <motion.div key={L.verdict.status} initial={{ scale: 1.4, opacity: 0, rotate: -6 }} animate={{ scale: 1, opacity: 1, rotate: -6 }} exit={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                      <Stamp v={L.verdict} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="mono mt-2 h-6 truncate text-[clamp(13px,0.8vw,16px)]" style={{ color }}>{L.action ? `${actionText(L.action)}  ` : ''}<span className="muted">{L.action?.reason}</span></div>
            </div>
          );
        })}
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
        <AnimatePresence mode="wait">
          <motion.div key={caption.big + caption.small} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}
            className="pointer-events-none max-w-[1500px] text-center">
            <div className="text-[clamp(28px,3.2vw,64px)] font-semibold leading-[1.05] tracking-[-0.03em]" style={{ color: bigColor }}>{caption.big}</div>
            <div className="mt-1 line-clamp-2 text-[clamp(15px,1.25vw,26px)] text-[#B8C1CE]">{caption.small}</div>
          </motion.div>
        </AnimatePresence>
      </div>
      <Ticker items={ticker} />
      {err && <div className="absolute right-8 top-16 rounded bg-[#F43F5E22] px-3 py-1 text-[12px] text-[#FDA4AF]">{err}</div>}
    </div>
  );
}

function MubitCounter({ calls }: { calls: number }) {
  return (
    <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-[#FF450066] bg-[#FF45001a] px-3 py-1">
      <span className="h-2 w-2 rounded-full bg-[#FF4500] shadow-[0_0_10px_#FF4500]" />
      <motion.span key={calls} initial={{ y: -6, opacity: 0.4 }} animate={{ y: 0, opacity: 1 }} className="num text-[clamp(15px,1vw,20px)] font-semibold text-white">{calls.toLocaleString('en-GB')}</motion.span>
      <span className="text-[13px] text-[#FFB08F]">calls routed through Mubit</span>
    </span>
  );
}

function Ticker({ items }: { items: string[] }) {
  if (!items.length) return <div className="h-[44px] shrink-0" />;
  const line = items.join('   ◆   ');
  return (
    <div className="relative -mx-[clamp(16px,2vw,40px)] h-[44px] shrink-0 overflow-hidden border-t border-white/10 bg-[#0D1016]">
      <span className="absolute left-0 top-0 z-10 flex h-full items-center bg-[#22D3EE] px-4 text-[13px] font-bold uppercase tracking-[0.14em] text-[#07080B]">Held-out scoreboard</span>
      <div className="ticker-track mono flex h-full items-center whitespace-nowrap text-[15px] text-white/85">
        <span className="pr-16">{line}</span><span className="pr-16" aria-hidden>{line}</span>
      </div>
    </div>
  );
}

function Stamp({ v }: { v: Verdict }) {
  const map: Record<string, [string, string, boolean]> = {
    passed: ['PASS', '#34D399', false], bug_reported: ['BUG REPORTED', '#F43F5E', true], violation: [`POLICY VIOLATION ${v.violations[0] ?? ''}`, '#F43F5E', false],
    stuck: ['STUCK', '#F59E0B', false], failed: [v.reason.startsWith('Passed a broken') ? 'FAILED — PASSED A BROKEN CHECKOUT' : 'FAILED', '#F43F5E', false],
  };
  const [text, c, fill] = map[v.status] ?? [v.status, '#F59E0B', false];
  return (
    <div className="rounded-xl border-[5px] px-8 py-3 text-center text-[44px] font-black tracking-[0.04em] shadow-2xl"
      style={{ borderColor: c, color: fill ? '#fff' : c, background: fill ? c : '#07080Bcc', boxShadow: `0 0 60px ${c}66` }}>
      {text}
      {v.status === 'bug_reported' && <div className="text-[16px] font-semibold tracking-normal opacity-90">{v.reason.replace('Correctly reported: ', '')}</div>}
    </div>
  );
}

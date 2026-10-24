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
import { ShopViewport } from './ShopViewport';
import type { ShopFrame } from './shopFrame';
import { Wordmark } from './Shell';
import { actionText } from './ui';

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

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden px-8 pb-8 pt-6">
      <div className="flex items-center gap-4">
        <Wordmark size={26} />
        <span className="rounded-md border border-[#F59E0B55] bg-[#F59E0B14] px-2 py-0.5 text-[11px] font-semibold tracking-[0.14em] text-[#FCD34D]">NIGHT SHIFT</span>
        <span className="text-[15px] muted">Self-healing tools guess. RETRY learns your rules from every rescue.</span>
        <span className="ml-auto mono text-[12px] muted">{turn ? `seed ${turn.seed} · ${turn.closed.layoutTag}` : ''}{turn?.mode === 'mock' ? ' · mock model' : ''} · loop {loop}</span>
      </div>
      <div className="mt-5 grid min-h-0 flex-1 grid-cols-2 gap-6">
        {(['closed', 'adapted'] as const).map((k) => {
          const color = k === 'closed' ? '#94A3B8' : '#22D3EE';
          const L = live[k];
          const p50 = L.latency.length ? [...L.latency].sort((a, b) => a - b)[Math.floor(L.latency.length / 2)] : null;
          return (
            <div key={k} className="panel relative flex min-h-0 flex-col p-4" style={{ borderColor: `${color}55` }}>
              <div className="mb-3 flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
                <span className="text-[20px] font-semibold">{k === 'closed' ? 'GPT · closed' : `RETRY · open ${turn?.version ?? ''}`}</span>
                <span className="ml-auto mono text-[14px] muted">steps {L.step} · {p50 ?? '—'}ms · {k === 'closed' ? `$${L.cost.toFixed(4)}` : 'credits'}</span>
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
              <div className="mono mt-3 h-6 truncate text-[15px]" style={{ color }}>{L.action ? `${actionText(L.action)}  ` : ''}<span className="muted">{L.action?.reason}</span></div>
            </div>
          );
        })}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={caption.big + caption.small} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}
          className="pointer-events-none absolute bottom-10 left-10 z-40 max-w-[1100px] rounded-2xl border border-white/10 bg-[#07080Bd9] px-8 py-6 shadow-2xl backdrop-blur-xl">
          <div className="text-[52px] font-semibold leading-[1.05] tracking-[-0.03em]" style={{ color: caption.big === 'BUG REPORTED' ? '#F43F5E' : undefined }}>{caption.big}</div>
          <div className="mt-2 text-[22px] muted">{caption.small}</div>
        </motion.div>
      </AnimatePresence>
      {err && <div className="absolute right-8 top-6 rounded bg-[#F43F5E22] px-3 py-1 text-[12px] text-[#FDA4AF]">{err}</div>}
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

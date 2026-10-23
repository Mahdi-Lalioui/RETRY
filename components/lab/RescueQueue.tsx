'use client';
// plan §12.3 — Rescue queue: auto-runs base v1 on TRAINING seeds (1–200) in the real shop (iframe + bridge §28) and
// stops at each stuck point (rule violation, missed bug, false alarm, loop) for a human to click the right element.
// Each rescue is POSTed to /api/corrections as source 'human' (augmented ×8 and sent to Mubit server-side).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { AgentAction, HistoryItem, Task } from '@/lib/agent/types';
import type { BugId, ShopState } from '@/lib/shop/state';
import { TASKS } from '@/lib/shop/tasks';
import { BUG_IDS, BUGS, bugsAffecting } from '@/lib/shop/bugs';
import { detectRescue, type RescuePoint } from '@/lib/train/detect';
import { resolveTarget } from '@/lib/shop/engine';
import { ShopViewport } from './ShopViewport';
import type { Pick, ShopFrame } from './shopFrame';
import { Diff, RuleChip, actionText } from './ui';

const MODEL_REF = { kind: 'open' as const, model: `open:${process.env.NEXT_PUBLIC_OPEN_BASE_MODEL || 'open-base'}`, label: 'Base · open v1' };
const RULE_OPTIONS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'BUG', 'Other'] as const;
const MAX_STEPS = 24;

function taskFor(seed: number): Task { return TASKS[(seed * 5) % TASKS.length]; }
function bugsFor(seed: number, task: Task): BugId[] {
  if (seed % 3 !== 0) return [];
  const valid = BUG_IDS.filter((b) => bugsAffecting(task, [b]).length);
  return [valid[Math.floor(seed / 3) % valid.length]];
}

interface Stuck { point: RescuePoint; stepId: string; bad: AgentAction; state: ShopState; snapshot: string }
interface LogLine { k: number; text: string; tone: 'ok' | 'bad' | 'rescue' | 'muted' }

export function RescueQueue({ onCorrection }: { onCorrection: () => void }) {
  const [seed, setSeed] = useState(() => 1 + Math.floor((Date.now() / 1000) % 200));
  const [running, setRunning] = useState(false);
  const [stuck, setStuck] = useState<Stuck | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [value, setValue] = useState('');
  const [rule, setRule] = useState<string>('R1');
  const [hint, setHint] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [done, setDone] = useState(0);
  const [stats, setStats] = useState({ rescues: 0, runs: 0, started: Date.now(), times: [] as number[] });
  const frame = useRef<ShopFrame | null>(null);
  const stop = useRef(false);
  const resolveRescue = useRef<((a: AgentAction | null) => void) | null>(null);
  const stuckAt = useRef(0);
  const k = useRef(0);
  const task = taskFor(seed);
  const bugs = bugsFor(seed, task);

  const push = (text: string, tone: LogLine['tone'] = 'muted') => setLog((l) => [{ k: ++k.current, text, tone }, ...l].slice(0, 40));

  const waitRescue = () => new Promise<AgentAction | null>((r) => { resolveRescue.current = r; });

  const runOne = useCallback(async (sd: number) => {
    const f = frame.current; if (!f) return;
    const t = taskFor(sd); const b = bugsFor(sd, t);
    await f.boot(sd, 1, b);
    const runId = `rq_${sd}_${Date.now().toString(36)}`;
    const history: HistoryItem[] = [];
    push(`seed ${sd} · ${t.id} ${t.goal}${b.length ? ` · bug ${b[0]}` : ''}`, 'muted');
    for (let idx = 0; idx < MAX_STEPS && !stop.current; idx++) {
      const snap = await f.snapshot();
      const res = await fetch('/api/agent/step', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        runId, lane: 'base', taskId: t.id, goal: t.goal, snapshot: snap.snapshot, history, modelRef: MODEL_REF, stepIdx: idx, state: snap.state, seed: sd, bugs: b,
      }) }).then((r) => r.json());
      if (!res.ok) { push(`step failed: ${res.error}`, 'bad'); return; }
      let action: AgentAction = res.data.action;
      const p = detectRescue(t, snap.state, action, history);
      if (p) {
        push(`✕ ${actionText(action)} — ${p.why}`, 'bad');
        setStuck({ point: p, stepId: res.data.stepId, bad: action, state: snap.state, snapshot: snap.snapshot });
        setRule(p.rule ?? 'Other'); setPick(null); setValue(''); setHint(false);
        stuckAt.current = Date.now();
        if (p.goodAction.type !== 'report_bug') f.highlight(true);
        const good = await waitRescue();
        f.highlight(false);
        setStuck(null);
        if (!good) { push('skipped', 'muted'); return; }
        action = good;
        if (good.type === 'report_bug' || good.type === 'done') { push(`✓ rescued: ${actionText(good)}`, 'rescue'); return; }
        const sem = good.target ? resolveTarget(snap.state, good.target) : undefined;
        if (sem) {
          const r = await f.apply(sem, good.value);
          history.push({ action: good, result: r.result });
        }
        push(`✓ rescued: ${actionText(good)}`, 'rescue');
        continue;
      }
      if (action.type === 'done' || action.type === 'report_bug') { push(`${action.type === 'done' ? '✓ done' : '⚑ bug reported'} — ${action.reason}`, 'ok'); return; }
      const r = await f.act(action);
      history.push({ action, result: r.result });
      push(`${actionText(action)} → ${r.result}`, r.result === 'ok' ? 'ok' : 'muted');
    }
  }, []);

  const start = async () => {
    stop.current = false; setRunning(true);
    let sd = seed;
    try {
      while (!stop.current) {
        await runOne(sd);
        setDone((d) => d + 1); setStats((s) => ({ ...s, runs: s.runs + 1 }));
        sd = sd >= 200 ? 1 : sd + 1;
        if (!stop.current) setSeed(sd);
        await new Promise((r) => setTimeout(r, 600));
      }
    } catch (e) { push(`error: ${(e as Error).message}`, 'bad'); }
    setRunning(false);
  };

  // pick messages from the iframe (highlight mode)
  useEffect(() => {
    const f = frame.current; if (!f) return;
    const off = f.on((m) => { if (m.type === 'retry:pick') { setPick(m as unknown as Pick); if ((m.role as string) !== 'textbox') setValue(''); } });
    return () => { off(); };
  });

  const submit = async (override?: AgentAction) => {
    if (!stuck) return;
    let good: AgentAction | null = override ?? null;
    if (!good && pick) {
      const type = pick.role === 'textbox' ? 'type' : pick.role === 'select' ? 'select' : 'click';
      good = { type, target: pick.id, ...(type !== 'click' ? { value } : {}), reason: `Human rescue${rule && rule !== 'Other' ? `: ${rule}` : ''}` };
    }
    if (!good) return;
    const r = await fetch('/api/corrections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stepId: stuck.stepId, goodAction: good, rule }) }).then((x) => x.json());
    if (r.ok) {
      setStats((s) => ({ ...s, rescues: s.rescues + 1, times: [...s.times, Date.now() - stuckAt.current] }));
      push(`→ correction ${r.data.correctionId.slice(-6)} · ×${r.data.augmented} augmented · sent to Mubit`, 'rescue');
      onCorrection();
    } else push(`correction failed: ${r.error}`, 'bad');
    resolveRescue.current?.(good); resolveRescue.current = null;
  };

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (!stuck) return;
      if (e.key === 'Enter' && (pick || stuck.point.goodAction.type === 'report_bug')) {
        e.preventDefault();
        void submit(stuck.point.goodAction.type === 'report_bug' && !pick ? { type: 'report_bug', reason: value || stuck.point.goodAction.reason } : undefined);
      }
      if (e.key === 'Escape') { resolveRescue.current?.(null); resolveRescue.current = null; }
    };
    window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd);
  });

  const avg = stats.times.length ? Math.round(stats.times.reduce((a, b) => a + b, 0) / stats.times.length / 1000) : null;
  const src = `/shop/${seed}?lane=base&task=${task.id}&v=1${bugs.length ? `&bugs=${bugs.join(',')}` : ''}`;
  const [initialSrc] = useState(src);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="mono rounded-md bg-[#A78BFA1A] px-2 py-0.5 text-[12px] font-semibold text-[#C4B5FD]">Base · open v1</span>
          <span className="mono text-[12px] muted">training seed {seed}</span>
          <span className="text-[13px]"><b className="mono text-[var(--rx-learn)]">{task.id}</b> {task.goal}</span>
          {bugs[0] && <span className="rounded border border-[#F43F5E55] px-1.5 text-[11px] text-[#FDA4AF]">bug: {BUGS[bugs[0]].title}</span>}
          <div className="ml-auto flex gap-2">
            {!running ? <button className="btn btn-learn" onClick={() => void start()}>▶ Start queue</button>
              : <button className="btn" onClick={() => { stop.current = true; resolveRescue.current?.(null); }}>⏸ Stop</button>}
          </div>
        </div>
        <div className="relative">
          <ShopViewport src={initialSrc} color="#A78BFA" onFrame={(f) => { frame.current = f; }}>
            {stuck && <div className="pointer-events-none absolute inset-0 rounded-[10px] ring-2 ring-[#F59E0B] shadow-[inset_0_0_80px_#F59E0B33]" />}
          </ShopViewport>
        </div>
        <AnimatePresence>
          {stuck && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 rounded-xl border border-[#F59E0B66] bg-[#F59E0B0D] p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="pulse text-[12px] font-bold tracking-[0.14em] text-[#FCD34D]">RESCUE NEEDED — show RETRY the right move</span>
                <span className="text-[12px] muted">{stuck.point.why}</span>
                <span className="ml-auto text-[11px] muted">Click the right element · <kbd>Enter</kbd> to teach · <kbd>Esc</kbd> to skip</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <Diff bad={stuck.bad} good={pick ? { type: pick.role === 'textbox' ? 'type' : 'click', target: pick.id, value: value || undefined, reason: '' } : { type: 'click', target: '?', reason: '' }} labelGood={pick?.label} />
                {pick?.role === 'textbox' && <input autoFocus className="input mono w-[260px]" placeholder="value to type" value={value} onChange={(e) => setValue(e.target.value)} />}
                {stuck.point.goodAction.type === 'report_bug' && (
                  <div className="flex items-center gap-2">
                    <input className="input w-[300px]" placeholder="bug evidence (e.g. total shows £NaN)" value={value} onChange={(e) => setValue(e.target.value)} />
                    <button className="btn" style={{ borderColor: '#F43F5E88', color: '#FDA4AF' }} onClick={() => void submit({ type: 'report_bug', reason: value || stuck.point.goodAction.reason })}>⚑ Report bug</button>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] uppercase tracking-[0.1em] faint">Rule</span>
                {RULE_OPTIONS.map((r) => (
                  <button key={r} onClick={() => setRule(r)} className={`rounded-md border px-2 py-0.5 mono text-[11px] ${rule === r ? 'border-[#F59E0B] bg-[#F59E0B22] text-[#FCD34D]' : 'border-transparent muted hover:text-[var(--rx-text)]'}`}>{r}</button>
                ))}
                <button className="ml-auto text-[11px] muted underline-offset-2 hover:underline" onClick={() => setHint((h) => !h)}>{hint ? `solver suggests: ${actionText(stuck.point.goodAction)}` : 'show hint'}</button>
                <button className="btn btn-amber ml-2" disabled={!pick} onClick={() => void submit()}>Teach RETRY ↵</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex flex-col gap-4">
        <div className="panel grid grid-cols-3 gap-2 p-4">
          {[['rescues', stats.rescues], ['runs', done], ['avg / rescue', avg !== null ? `${avg}s` : '—']].map(([l, v]) => (
            <div key={l as string}><div className="text-[10px] uppercase tracking-[0.12em] muted">{l}</div><div className="num text-[24px] font-semibold">{v}</div></div>
          ))}
          <div className="col-span-3 text-[11px] faint">Target: 20s per rescue. Each rescue → 1 human + 8 augmented examples → Mubit.</div>
        </div>
        <div className="panel min-h-[420px] p-4">
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.12em] muted"><span>Run log</span>{stuck && <RuleChip rule={stuck.point.rule} small />}</div>
          <ol className="mono flex flex-col gap-1 text-[12px]">
            <AnimatePresence initial={false}>
              {log.map((l) => (
                <motion.li key={l.k} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className={l.tone === 'bad' ? 'text-[#FDA4AF]' : l.tone === 'rescue' ? 'text-[#FCD34D]' : l.tone === 'ok' ? 'text-[#A7F3D0]' : 'muted'}>{l.text}</motion.li>
              ))}
            </AnimatePresence>
            {!log.length && <li className="faint">Press “Start queue”. The base model runs on training seeds and stops whenever it breaks a house rule, misses a bug or loops.</li>}
          </ol>
        </div>
      </div>
    </div>
  );
}

'use client';
// Plain-English narration for judges: one caption derived from Mission Control state (no new store fields).
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { LaneId } from '@/lib/agent/types';
import { useMission, type MissionState } from '@/lib/store/mission';
import { LANE_THEME } from '@/lib/store/lanes';
import { RULES } from '@/lib/shop/rules';
import type { RuleId } from '@/lib/shop/state';
import { describeAction } from '@/lib/agent/loop';
import { on } from '@/lib/store/bus';
import { Kbd } from '@/components/ui/Kbd';

type Tone = 'idle' | 'run' | 'fail' | 'rescue' | 'mubit' | 'learn' | 'pass';
interface Caption { step: string; text: React.ReactNode; tone: Tone; key: string }

const TONE: Record<Tone, string> = {
  idle: '#9AA4B4', run: '#E8EDF5', fail: '#F43F5E', rescue: '#F59E0B', mubit: '#FF6A2B', learn: '#22D3EE', pass: '#34D399',
};

const laneName = (l: LaneId, adapted: string) => (l === 'adapted' ? `RETRY ${adapted}` : l === 'base' ? 'Base model v1' : l === 'closed' ? 'GPT' : 'ICL lane');
const ruleTitle = (r?: RuleId | 'other') => (r && r !== 'other' && RULES[r] ? RULES[r].title : undefined);
const nextLabel = (l: string) => `v${(parseInt(l.replace(/\D/g, ''), 10) || 0) + 1}`;

function derive(s: MissionState, lastStamp: LaneId | null): Caption {
  const A = s.adapted.label;
  const t = s.training;
  // 1. Rescue in progress
  if (s.rescue) {
    const r = s.rescue;
    const rule = ruleTitle(r.autoRule);
    return {
      step: 'Rescue', tone: 'rescue', key: `rescue-${r.lane}-${r.stepId}-${!!r.picked}`,
      text: r.picked
        ? <>Teaching: <b className="text-pass">“{r.picked.label}”</b> is the right move. Press <Kbd>Enter</Kbd> to send it to Mubit as a training example.</>
        : <>{laneName(r.lane, A)} {rule ? <>broke house rule <b className="text-fail">{r.autoRule}</b> — {rule.toLowerCase()}</> : <>is stuck on <span className="font-mono">{describeAction(r.badAction, r.badLabel)}</span></>}. A human shows the right move.</>,
    };
  }
  // 2. Correction in flight
  const flying = s.corrections.find((c) => !c.landed);
  if (flying) {
    return {
      step: 'Capture', tone: 'mubit', key: `fly-${flying.id}`,
      text: <>Rescue captured → sent to <b className="text-mubit">Mubit</b> as the preferred output for that exact call, re-rendered on <b>{flying.augmented || 8}</b> more training layouts.</>,
    };
  }
  // 3. Training lifecycle
  if (t.phase === 'training') return { step: 'Update', tone: 'mubit', key: 'train', text: <><b className="text-mubit">Mubit</b> is building a versioned update → <b className="text-learn">{nextLabel(A)}</b> from {s.counts.examples.toLocaleString('en-GB')} training examples.</> };
  if (t.phase === 'evaluating') return { step: 'Gate', tone: 'learn', key: 'eval', text: <>Evaluating <b className="text-learn">{nextLabel(A)}</b> on <b>48 held-out runs</b> it has never seen — promoted only if success and bug recall don’t drop.</> };
  if (t.phase === 'promoted') return { step: 'Promoted', tone: 'pass', key: `promo-${A}`, text: <><b className="text-learn">{A}</b> passed the held-out gate and now serves the RETRY lane{s.prevAdaptedLabel ? <> (was {s.prevAdaptedLabel} — one click to roll back in the Lab)</> : null}.</> };
  if (t.phase === 'held_back') return { step: 'Held back', tone: 'fail', key: 'held', text: <>New version <b className="text-fail">held back</b>: {t.reason ?? 'regression on held-out runs'}. {A} keeps serving.</> };
  // 4. Run verdicts / activity
  const lanes = s.activeLanes();
  if (lastStamp && s.lanes[lastStamp]?.verdict) {
    const v = s.lanes[lastStamp].verdict!;
    const n = laneName(lastStamp, A);
    if (v.status === 'violation') {
      const r = v.violations[0] as RuleId | undefined;
      return { step: 'Verdict', tone: 'fail', key: `v-${lastStamp}-${s.lanes[lastStamp].verdictKey}`, text: <>{n} broke house rule <b className="text-fail">{r}</b>{ruleTitle(r) ? <> — {ruleTitle(r)!.toLowerCase()}</> : null}. No model knows your team’s rules.</> };
    }
    if (v.status === 'bug_reported') return { step: 'Verdict', tone: 'fail', key: `v-${lastStamp}-b`, text: <>{n} reported a real regression: <b className="text-fail">“{v.reason}”</b> — a ready-made bug ticket, not a false pass.</> };
    if (v.status === 'passed') return { step: 'Verdict', tone: 'pass', key: `v-${lastStamp}-p${s.lanes[lastStamp].verdictKey}`, text: <>{n} completed the ticket <b className="text-pass">following every house rule</b>{lastStamp === 'adapted' ? ' — learned from past rescues, not prompted.' : '.'}</> };
    if (v.status === 'stuck') return { step: 'Verdict', tone: 'rescue', key: `v-${lastStamp}-s${s.lanes[lastStamp].verdictKey}`, text: <>{n} got stuck — {v.reason.toLowerCase()}. This is where a human would normally rescue it, every single time.</> };
    if (v.status === 'failed') return { step: 'Verdict', tone: 'fail', key: `v-${lastStamp}-f`, text: <>{n} failed — {v.reason}.</> };
  }
  if (s.running) return { step: 'Run', tone: 'run', key: `run-${s.taskId}-${s.seed}`, text: <>Running ticket <b>{s.taskId}</b> on {lanes.length} lanes. Every step is one model call, <b className="text-mubit">routed through Mubit</b>.</> };
  if (t.phase === 'ready') return { step: 'Ready', tone: 'learn', key: 'ready', text: <>{s.counts.sinceVersion} new examples since {A}. Press <Kbd>T</Kbd> to ask Mubit for the next version.</> };
  return { step: 'Idle', tone: 'idle', key: 'idle', text: <>Night shift: {s.counts.rescues.toLocaleString('en-GB')} rescues → {s.counts.examples.toLocaleString('en-GB')} training examples → RETRY {A}. Press <Kbd>R</Kbd> to run, <Kbd>?</Kbd> for how Mubit is used.</> };
}

export function StoryStrip() {
  const [lastStamp, setLastStamp] = useState<LaneId | null>(null);
  useEffect(() => on('stamp', (e) => setLastStamp(e.lane)), []);
  const running = useMission((s) => s.running);
  useEffect(() => { if (running) setLastStamp(null); }, [running]);
  const state = useMission();
  const cap = derive(state, lastStamp); // fresh JSX each render; only key changes animate
  const color = TONE[cap.tone];
  return (
    <div className="relative mt-2.5 flex h-[34px] shrink-0 items-center gap-3 overflow-hidden rounded-[10px] border px-3 2xl:h-[40px]"
      style={{ borderColor: `${color}40`, background: `linear-gradient(90deg, ${color}14, #0D1016 40%)` }} aria-live="polite">
      <span className="flex shrink-0 items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] 2xl:text-[12px]" style={{ color }}>{cap.step}</span>
      </span>
      <span className="h-4 w-px shrink-0 bg-white/10" />
      <div className="relative min-w-0 flex-1">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={cap.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="truncate text-[13px] text-white/90 2xl:text-[15.5px]">
            {cap.text}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

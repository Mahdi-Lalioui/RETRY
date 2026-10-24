'use client';
// Client-driven agent loop (plan §9.6). Lanes run concurrently, each with its own AbortController.
import { nanoid } from 'nanoid';
import type { AgentAction, HistoryItem, LaneId, StepResponse, Verdict } from '@/lib/agent/types';
import type { BugId, RuleId, ShopState } from '@/lib/shop/state';
import { LANES } from '@/lib/agent/lanes';
import { detectStuck } from '@/lib/agent/stuck';
import { getTask, TASKS } from '@/lib/shop/tasks';
import { bugsAffecting } from '@/lib/shop/bugs';
import { applyAction, resolveTarget } from '@/lib/shop/engine';
import { api, apiSafe } from '@/lib/store/api';
import { bridge, waitReady, type Pick } from '@/lib/store/frames';
import { emit } from '@/lib/store/bus';
import { MAX_STEPS, REFRESH_MIN_EXAMPLES } from '@/lib/store/lanes';
import type { CorrectionView, CurvePoint, ScoreRow, Scope } from '@/lib/store/mission';
import { play } from '@/lib/store/sfx';
import { installRecorderHotkey, liveMissionState, recordEvent, startReplay, stopReplay } from './demo-driver';

const S = liveMissionState;
const controllers = new Map<LaneId, AbortController>();
const rescueWaiters = new Map<LaneId, (r: RescueResult | null) => void>();
const usedSeeds = new Set<number>();
let rescueChain: Promise<void> = Promise.resolve();
let baseRescuedOnce = false;
let runEpoch = 0;

export interface RescueResult { pick: Pick; value?: string; rule?: RuleId | 'other'; ruleText?: string }

class Aborted extends Error { constructor() { super('aborted'); } }
const check = (sig: AbortSignal) => { if (sig.aborted) throw new Aborted(); };

/** Release local waits promptly even if an iframe or server response arrives later. */
function untilAbort<T>(work: Promise<T>, sig: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => { sig.removeEventListener('abort', abort); reject(new Aborted()); };
    sig.addEventListener('abort', abort, { once: true });
    work.then((v) => { sig.removeEventListener('abort', abort); if (sig.aborted) reject(new Aborted()); else resolve(v); }, (e) => { sig.removeEventListener('abort', abort); reject(e); });
    if (sig.aborted) abort();
  });
}

export function labelsFromSnapshot(snapshot: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of snapshot.matchAll(/\b(e\d+)\s+\w+\s+"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

export function describeAction(a: AgentAction, label?: string): string {
  if (a.type === 'done') return 'done';
  if (a.type === 'report_bug') return 'report_bug';
  if (a.type === 'scroll') return 'scroll';
  const tgt = a.target ?? '?';
  const lab = label ? ` "${label}"` : '';
  if (a.type === 'type') return `type ${tgt}${lab} ← "${a.value ?? ''}"`;
  if (a.type === 'select') return `select ${tgt}${lab} ← ${a.value ?? ''}`;
  return `click ${tgt}${lab}`;
}

function modelRefFor(lane: LaneId) {
  const ref = LANES[lane].modelRef();
  if (lane === 'adapted') {
    const v = S().adapted;
    return { ...ref, versionId: v.versionId ?? ref.versionId, label: `RETRY ${v.label}` };
  }
  return ref;
}

async function finish(runId: string, lane: LaneId, taskId: string, finalAction: AgentAction | null, state: ShopState | null, fallback: Verdict): Promise<Verdict> {
  try {
    if (!state) return fallback;
    const v = await api<Verdict>('/api/agent/finish', { runId, lane, taskId, finalAction, finalState: state, stuck: finalAction === null });
    // A run that ended on a house-rule violation shows a violation verdict, not "stuck" (the judge's stuck flag wins server-side).
    if (!finalAction && fallback.status === 'violation' && v.status === 'stuck') return { ...v, status: 'violation', reason: fallback.reason, violations: [...new Set([...v.violations, ...fallback.violations])].sort() as RuleId[] };
    return v;
  } catch { return finalAction ? { status: 'failed', correct: false, reason: 'Run verification unavailable. Try again.', violations: state?.violations ?? [] } : fallback; }
}

function stamp(lane: LaneId, v: Verdict) {
  recordEvent({ kind: 'verdict', sceneId: S().taskId, lane, runId: S().lanes[lane].runId ?? '', verdict: v, steps: S().lanes[lane].steps.length });
  S().patchLane(lane, (l) => ({ verdict: v, verdictKey: l.verdictKey + 1, status: 'done', thinking: false }));
  emit('stamp', { lane });
  play('thunk');
}

async function runLane(lane: LaneId, sig: AbortSignal) {
  if (sig.aborted) return;
  const st = S();
  const task = getTask(st.taskId);
  const runId = `run_${nanoid(10)}`;
  const history: HistoryItem[] = [];
  st.patchLane(lane, { status: 'running', runId, steps: [], verdict: undefined, bug: undefined, latencies: [], costUsd: 0, costKnown: false, promptChars: 0, flash: null, error: undefined, thinking: false });
  let state: ShopState | null = null;
  // One live rescue per lane per run: a rescue cannot change the model mid-run, so a second failure ends the run
  // and points at the Mubit update instead of stalling the stage on rescue after rescue.
  let rescued = false;
  try {
    for (let stepIdx = 0; stepIdx <= MAX_STEPS; stepIdx++) {
      check(sig);
      const snap = await bridge.snapshot(lane);
      check(sig);
      state = snap.state;
      S().patchLane(lane, { layoutTag: snap.layoutTag, thinking: true });
      if (snap.layoutTag && snap.layoutTag !== S().layoutTag) S().set({ layoutTag: snap.layoutTag, layoutFlash: S().layoutFlash + 1 });
      const labels = labelsFromSnapshot(snap.snapshot);
      const res = await api<StepResponse>('/api/agent/step', {
        runId, lane, taskId: task.id, goal: task.goal, snapshot: snap.snapshot,
        history: history.slice(-6), modelRef: modelRefFor(lane), stepIdx,
        state, seed: S().seed, bugs: S().bugs,
      }, sig);
      check(sig);
      emit('call', { lane, ms: res.latencyMs });
      if (S().health.mubit === 'down') void recheckHealth();
      recordEvent({ kind: 'step', sceneId: S().taskId, lane, runId, stepIdx, action: res.action, result: 'ok', latencyMs: res.latencyMs, costUsd: res.costUsd, promptChars: res.promptChars, snapshot: snap.snapshot });
      S().set({ calls: S().calls + 1 });
      const entry = { idx: stepIdx, action: res.action, label: res.action.target ? labels[res.action.target] : undefined, latencyMs: res.latencyMs, stepId: res.stepId, callId: res.callId };
      S().patchLane(lane, (l) => ({
        thinking: false,
        steps: [...l.steps, entry],
        latencies: [...l.latencies, res.latencyMs],
        costUsd: l.costUsd + (res.costUsd ?? 0), costKnown: l.costKnown || res.costUsd !== null,
        promptChars: res.promptChars,
      }));

      if (res.action.type === 'done' || res.action.type === 'report_bug') {
        const v = await finish(runId, lane, task.id, res.action, state, {
          status: res.action.type === 'done' ? 'passed' : 'bug_reported', correct: true, reason: res.action.reason, violations: state?.violations ?? [],
        });
        check(sig);
        if (res.action.type === 'report_bug') {
          S().patchLane(lane, {
            bug: {
              evidence: res.action.reason, page: state?.page ?? 'unknown', layoutTag: snap.layoutTag, seed: S().seed, taskId: task.id, bugs: S().bugs,
              steps: S().lanes[lane].steps.slice(0, -1).map((s, i) => `${i + 1}. ${describeAction(s.action, s.label)}${s.human ? ' (human)' : ''} → ${s.result ?? 'ok'}`),
            },
          });
        }
        stamp(lane, v);
        return;
      }

      const before = state?.violations.length ?? 0;
      const preAct = state;
      const actRes = await bridge.act(lane, res.action);
      check(sig);
      state = actRes.state;
      const after = state?.violations.length ?? 0;
      history.push({ action: res.action, result: actRes.result });
      S().patchLane(lane, (l) => ({ steps: l.steps.map((s) => (s.idx === stepIdx && !s.human ? { ...s, result: actRes.result } : s)), layoutTag: actRes.layoutTag }));
      const newRule = after > before ? (state.violations[after - 1] as RuleId) : undefined;
      if (newRule) { S().patchLane(lane, { flash: newRule }); play('alert'); }

      if (detectStuck(history, before, after, MAX_STEPS)) {
        // Only open-model lanes are rescued live: their rescues train the adapter. GPT/ICL end with the verdict.
        // Base v1 never learns, so after its first rescue on stage it only stamps verdicts; RETRY's rescues still open.
        if (S().mode !== 'live' || lane === 'closed' || lane === 'icl' || rescued || (lane === 'base' && baseRescuedOnce)) {
          const reason = rescued
            ? (newRule ? `Broke ${newRule} again · needs a Mubit update` : 'Stuck again · needs a Mubit update')
            : (newRule ? `Broke house rule ${newRule}` : 'Agent got stuck');
          const v = await finish(runId, lane, task.id, null, state, { status: newRule ? 'violation' : 'stuck', correct: false, reason, violations: state.violations });
          check(sig);
          stamp(lane, v);
          return;
        }
        // Live: ask a human. One rescue at a time — other stuck lanes queue behind it.
        const prevRescue = rescueChain;
        let release: () => void = () => {};
        rescueChain = new Promise<void>((r) => { release = r; });
        S().patchLane(lane, { rescueQueued: true });
        let rescue: RescueResult | null = null;
        try {
          await untilAbort(prevRescue, sig);
          check(sig);
          S().patchLane(lane, { rescueQueued: false });
          // The human teaches the decision the model got wrong, so put the shop back on the page *before* the bad action
          // (e.g. the upsell modal is open again and "Not now" can be picked). The violation stays in the step log.
          if (newRule && preAct) {
            try { state = (await bridge.restore(lane, preAct)).state; } catch { /* keep current page */ }
          }
          check(sig);
          S().patchLane(lane, { status: 'rescue' });
          S().set({ rescue: { lane, stepId: res.stepId, badAction: res.action, badLabel: entry.label, autoRule: newRule, rule: newRule, otherText: '', value: '' } });
          bridge.highlight(lane, true);
          for (;;) {
            rescue = await untilAbort(new Promise<RescueResult | null>((resolve) => { rescueWaiters.set(lane, resolve); }), sig);
            // [G] Never accept a "correction" that itself breaks a house rule or repeats the stuck no-op (it would teach the wrong thing).
            const why = !rescue ? null
              : missingValue(rescue.pick, rescue.value) ?? (state ? rejectPick(state, rescue.pick.semKey, rescue.value, preAct && res.action.target ? resolveTarget(preAct, res.action.target) : undefined) : null);
            if (!why) break;
            const cur = S().rescue;
            if (cur?.lane === lane) S().set({ rescue: why.startsWith('Enter the value') ? { ...cur, rejected: why } : { ...cur, picked: undefined, value: '', rejected: why } });
            play('alert');
          }
        } finally {
          release();
          // A newer run may already own this lane and its rescue waiter.
          if (S().lanes[lane].runId === runId) {
            rescueWaiters.delete(lane);
            bridge.highlight(lane, false);
            S().patchLane(lane, { rescueQueued: false });
            if (S().rescue?.lane === lane) S().set({ rescue: null });
          }
        }
        check(sig);
        if (!rescue) {
          const vs = newRule && !state.violations.includes(newRule) ? [...state.violations, newRule] : state.violations; // pre-violation state was restored
          const v = await finish(runId, lane, task.id, null, state, { status: newRule ? 'violation' : 'stuck', correct: false, reason: newRule ? `Broke house rule ${newRule} · rescue skipped` : 'Stuck · rescue skipped', violations: vs });
          check(sig);
          stamp(lane, v);
          return;
        }
        rescued = true;
        if (lane === 'base') baseRescuedOnce = true;
        S().patchLane(lane, { status: 'running', flash: null });
        const good: AgentAction = {
          type: rescue.pick.role === 'textbox' ? 'type' : rescue.pick.role === 'select' ? 'select' : 'click',
          target: rescue.pick.id, value: rescue.value || undefined, reason: 'Human rescue',
        };
        void submitCorrection(lane, res.stepId, res.action, entry.label, good, rescue);
        const applied = await bridge.apply(lane, rescue.pick.semKey, rescue.value || undefined);
        check(sig);
        state = applied.state;
        history.push({ action: good, result: applied.result });
        S().patchLane(lane, (l) => ({ steps: [...l.steps, { idx: stepIdx, action: good, label: rescue.pick.label, result: applied.result, latencyMs: 0, human: true }] }));
      }
    }
    const v = await finish(runId, lane, task.id, null, state, { status: 'stuck', correct: false, reason: `Step budget (${MAX_STEPS}) exceeded`, violations: state?.violations ?? [] });
    check(sig);
    stamp(lane, v);
  } catch (e) {
    if (S().lanes[lane].runId !== runId) return;
    if (e instanceof Aborted || sig.aborted) { S().patchLane(lane, { status: S().lanes[lane].verdict ? 'done' : 'idle', thinking: false }); return; }
    void recheckHealth(true);
    S().patchLane(lane, { status: 'done', thinking: false, error: e instanceof Error ? e.message : String(e) });
    stamp(lane, { status: 'failed', correct: false, reason: e instanceof Error ? e.message.slice(0, 90) : 'Lane error', violations: [] });
  }
}

async function submitCorrection(lane: LaneId, stepId: string, bad: AgentAction, badLabel: string | undefined, good: AgentAction, r: RescueResult) {
  const id = `local_${nanoid(6)}`;
  const view: CorrectionView = {
    id, lane, rule: r.rule, ruleText: r.ruleText, bad: { action: bad, label: badLabel }, good: { action: good, label: r.pick.label },
    augmented: 8, status: 'queued', landed: false, at: Date.now(),
  };
  S().set({ corrections: [view, ...S().corrections].slice(0, 12) });
  emit('card', { id, lane });
  recordEvent({ kind: 'correction', sceneId: S().taskId, lane, rule: (r.rule === 'other' ? null : r.rule ?? (good.type === 'report_bug' ? 'BUG' : null)) as RuleId | 'BUG' | null, source: 'human', badAction: bad, goodAction: good, augmented: 8 });
  const isBug = good.type === 'report_bug';
  const rule = r.rule === 'other' ? 'Other' : r.rule ?? (isBug ? 'BUG' : undefined);
  const note = r.rule === 'other' && r.ruleText ? r.ruleText : undefined;
  try {
    const out = await api<{ correctionId: string; augmented: number | unknown[]; semKey?: string | null }>('/api/corrections', { stepId, goodAction: good, rule, note });
    const aug = Array.isArray(out.augmented) ? out.augmented.length : Number(out.augmented) || 0;
    // POST acknowledges persistence. Delivery runs after the response and can still fail.
    patchCorrection(id, { serverId: out.correctionId, status: 'queued', augmented: aug });
    void watchCorrection(id, out.correctionId);
    const c = S().counts;
    S().set({ counts: { rescues: c.rescues + 1, examples: c.examples + 1 + aug, sinceVersion: c.sinceVersion + 1 + aug } });
    const t = S().training;
    if (t.phase === 'collecting' && S().counts.sinceVersion >= REFRESH_MIN_EXAMPLES) S().set({ training: { ...t, phase: 'ready' } });
  } catch {
    patchCorrection(id, { status: 'failed' });
  }
}

/** A textbox/select pick needs a value, or the correction teaches an empty type/select. */
export function missingValue(pick: { role: string; label: string }, value?: string): string | null {
  return (pick.role === 'textbox' || pick.role === 'select') && !value?.trim() ? `Enter the value for “${pick.label}” first` : null;
}

/** Why a human pick cannot be a correction (null = acceptable). Pure: simulates the pick on the engine. */
export function rejectPick(state: ShopState, semKey: string, value: string | undefined, badSemKey?: string): string | null {
  let r: ReturnType<typeof applyAction>;
  try { r = applyAction(state, semKey, value || undefined); } catch { return null; }
  if (r.state.violations.length > state.violations.length) return `That breaks house rule ${r.state.violations[r.state.violations.length - 1]}: pick the right element`;
  if (semKey === badSemKey && r.effect === 'no_effect') return 'That is the move that got RETRY stuck: pick a different element';
  return null;
}

let lastHealthAt = 0;
/** [G] Keep the TopBar pill honest mid-session: re-read /api/health after a lane error and while it reads down. */
async function recheckHealth(force = false) {
  if (!force && Date.now() - lastHealthAt < 5000) return;
  lastHealthAt = Date.now();
  const h = await apiSafe<{ mubit: 'ok' | 'mock' | 'down'; db: string; demoMode: boolean; liveLanes?: string[] }>('/api/health');
  if (h) S().set({ health: { ...S().health, mubit: h.mubit, db: h.db, liveLanes: h.liveLanes } });
}

export function patchCorrection(id: string, p: Partial<CorrectionView>) {
  S().set({ corrections: S().corrections.map((c) => (c.id === id ? { ...c, ...p } : c)) });
}

async function watchCorrection(localId: string, serverId: string) {
  // A slow or unavailable provider leaves an honest queued card; never infer delivery from elapsed time.
  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const view = S().corrections.find((c) => c.id === localId);
    if (!view || view.status !== 'queued') return;
    const row = (await correctionStatuses())?.find((c) => c.id === serverId);
    if (row && (row.status === 'sent' || row.status === 'failed' || row.status === 'trained')) {
      patchCorrection(localId, { status: row.status });
      return;
    }
  }
}

async function correctionStatuses(): Promise<CorrectionRow[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const rows = await untilAbort(api<CorrectionRow[]>('/api/corrections?source=human&limit=1000', undefined, controller.signal), controller.signal);
    return Array.isArray(rows) ? rows : null;
  }
  catch { return null; }
  finally { clearTimeout(timeout); }
}

async function reconcileCorrections() {
  const rows = await correctionStatuses();
  if (!rows) return;
  S().set({ corrections: S().corrections.map((c) => {
    const row = rows.find((r) => r.id === (c.serverId ?? c.id));
    return row && (row.status === 'queued' || row.status === 'sent' || row.status === 'failed' || row.status === 'trained') ? { ...c, status: row.status } : c;
  }) });
}

/** Called by RescueOverlay. */
export function resolveRescue(lane: LaneId, r: RescueResult | null) {
  rescueWaiters.get(lane)?.(r);
}

// ───────────────────────── Mission actions (hotkeys) ─────────────────────────

export function stopAll() {
  runEpoch++;
  stopReplay();
  controllers.forEach((c) => c.abort());
  controllers.clear();
  rescueWaiters.forEach((w) => w(null));
  rescueChain = Promise.resolve();
  rescueWaiters.clear();
  S().activeLanes().forEach((l) => { bridge.cancel(l); bridge.highlight(l, false); S().patchLane(l, { rescueQueued: false, thinking: false, status: S().lanes[l].verdict ? 'done' : 'idle' }); });
  S().set({ running: false, rescue: null, mode: 'live' });
}

function resetFrames() {
  const s = S();
  s.activeLanes().forEach((l) => bridge.reset(l, s.seed, s.versionIndex, s.bugs, s.taskId));
}

let booting: Promise<void> | null = null;

export async function runAll() {
  const requestedEpoch = runEpoch;
  if (booting) await booting.catch(() => {}); // never run RETRY before its versions are loaded
  if (requestedEpoch !== runEpoch) return; // Stop or a task change cancels a Run waiting for bootstrap too.
  stopAll();
  const epoch = runEpoch;
  const s = S();
  s.resetLanes();
  resetFrames();
  s.set({ running: true });
  const lanes = s.activeLanes();
  const owned = new Map(lanes.map((lane) => { const c = new AbortController(); controllers.set(lane, c); return [lane, c] as const; }));
  const task = getTask(s.taskId);
  recordEvent({ kind: 'scene', sceneId: s.taskId, title: task.id, caption: task.goal, taskId: task.id, goal: task.goal, seed: s.seed, versionIndex: s.versionIndex, bugs: s.bugs, layoutTag: s.layoutTag,
    lanes: lanes.map((l) => ({ lane: l, label: LANES[l].label, versionLabel: l === 'adapted' ? s.adapted.label : l === 'base' ? 'v1' : '' })) });
  await new Promise((r) => setTimeout(r, 200));
  if (epoch !== runEpoch) return;
  await Promise.all(lanes.map(async (lane) => {
    const c = owned.get(lane)!;
    try {
      await untilAbort(waitReady(lane, 20, c.signal), c.signal);
      check(c.signal);
      await runLane(lane, c.signal);
    } catch (e) {
      if (!c.signal.aborted && epoch === runEpoch) S().patchLane(lane, { error: String(e), status: 'done' });
    } finally { if (controllers.get(lane) === c) controllers.delete(lane); }
  }));
  if (epoch === runEpoch) {
    S().set({ running: false });
    if (S().health.mubit === 'down') void recheckHealth(true); // [G] pill recovers once Mubit answers again
    void loadMetrics();
  }
}

export function nextUnseenSeed(): number {
  let seed = 0;
  do { seed = 10000 + Math.floor(Math.random() * 89999); } while (usedSeeds.has(seed));
  usedSeeds.add(seed);
  return seed;
}

export function shipNewVersion() {
  stopAll();
  const s = S();
  const versionIndex = s.versionIndex + 1;
  s.set({ seed: nextUnseenSeed(), versionIndex, layoutTag: `layout-v${versionIndex}`, layoutFlash: s.layoutFlash + 1 });
  s.resetLanes();
  resetFrames();
}

export function breakCheckout(bug: BugId) {
  stopAll();
  // coupon_500 only manifests on coupon tasks (lib/shop/bugs.bugsAffecting) — switch to one if needed.
  const task = getTask(S().taskId);
  const taskId = bugsAffecting(task, [bug]).length ? task.id : (TASKS.find((t) => t.wantsCoupon)?.id ?? task.id);
  S().set({ bugs: [bug], breakMenu: false, taskId });
  S().resetLanes();
  resetFrames();
}

export function heal() {
  stopAll();
  S().set({ bugs: [] });
  S().resetLanes();
  resetFrames();
}

export function setTask(taskId: string) {
  stopAll();
  S().set({ taskId });
  S().resetLanes();
  resetFrames();
}

export async function judgesTurn() {
  const task = TASKS[Math.floor(Math.random() * TASKS.length)];
  const bugs: BugId[] = ['pay_button_dead', 'total_nan', 'no_order_id', 'coupon_500'];
  stopAll();
  const pool = bugsAffecting(task, bugs);
  S().set({ seed: nextUnseenSeed(), taskId: task.id, bugs: Math.random() < 0.3 ? [pool[Math.floor(Math.random() * pool.length)]] : [] });
  await runAll();
}

export function toggleIcl() {
  stopAll();
  S().set({ iclOn: !S().iclOn });
  S().resetLanes();
}

export function toggleDemo() {
  const s = S();
  const next = s.mode === 'live' ? 'replay' : 'live';
  if (next === 'replay') stopAll();
  else { stopReplay(); s.resetLanes(); resetFrames(); }
  s.set({ mode: next, replayAt: s.replayAt ?? new Date().toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) });
  if (next === 'replay') void replayProvider?.();
}

// ───────────────────────── Training / versions ─────────────────────────

interface StatusRes { phase: 'collecting' | 'training' | 'evaluating' | 'promoted' | 'held_back'; progress?: number; version?: VersionLike; reason?: string; queued?: number; needed?: number }
let polling = false;

export async function trainNow() {
  if (S().mode === 'replay') stopAll();
  const t = S().training;
  if (polling || t.phase === 'training' || t.phase === 'evaluating') return;
  const startedAt = Date.now();
  S().set({ training: { phase: 'training', progress: 0, startedAt } });
  polling = true;
  try {
    const { jobId, versionId, skipped } = await api<{ jobId: string | null; versionId?: string; skipped?: string }>('/api/refresh', {});
    if (skipped) { S().set({ training: { phase: 'collecting', progress: 0, reason: skipped } }); play('alert'); return; }
    const pollId = jobId ?? versionId;
    S().set({ training: { ...S().training, jobId: pollId ?? null } });
    let failures = 0;
    for (let i = 0; i < 900; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      let st: StatusRes;
      try { st = await api<StatusRes>(`/api/refresh/status${pollId ? `?jobId=${encodeURIComponent(pollId)}` : ''}`); failures = 0; }
      catch (e) { if (++failures >= 5) throw e; continue; }
      if (st.phase === 'collecting') throw new Error('No active training job was found. Try Train now again.');
      recordEvent({ kind: 'version', phase: st.phase, label: st.version?.label ?? '…', progress: st.progress ?? (st.phase === 'promoted' || st.phase === 'held_back' ? 1 : 0.5), examples: st.version?.examples ?? undefined, headline: st.reason });
      if (st.phase === 'training') S().set({ training: { ...S().training, phase: 'training', progress: st.progress ?? 0 } });
      else if (st.phase === 'evaluating') S().set({ training: { ...S().training, phase: 'evaluating', progress: st.progress ?? 0.5 } });
      else if (st.phase === 'held_back') {
        S().set({ training: { ...S().training, phase: 'held_back', progress: 1, reason: st.reason ?? st.version?.heldBackReason ?? 'regression on bug detection' } });
        return;
      } else if (st.phase === 'promoted') {
        const secs = Math.round((Date.now() - startedAt) / 1000);
        S().set({ training: { ...S().training, phase: 'evaluating', progress: 1 } });
        await promote(st.version, secs);
        return;
      }
    }
    throw new Error('Training status timed out. Try Train now again.');
  } catch (e) {
    S().set({ training: { phase: 'held_back', progress: 0, reason: `Refresh failed: ${e instanceof Error ? e.message : String(e)}` } });
  } finally { polling = false; }
}

async function promote(v: StatusRes['version'], trainSeconds: number) {
  let next: { versionId?: string; label: string; examples?: number; createdAt?: string } | null | undefined = v ? toAdapted(v) : undefined;
  if (!next) {
    const list = await apiSafe<VersionLike[]>('/api/versions');
    const pick = list ? latestPromoted(list) : null;
    if (pick) next = pick;
  }
  const s = S();
  if (!next?.versionId) throw new Error('Promoted version metadata is unavailable. Reload versions before retrying.');
  const label = next.label;
  s.set({
    prevAdaptedLabel: s.adapted.label,
    adapted: { versionId: next?.versionId, label, examples: next?.examples ?? s.counts.examples, createdAt: next?.createdAt },
    flipKey: s.flipKey + 1,
    training: { phase: 'promoted', progress: 1, trainSeconds },
    counts: { ...s.counts, sinceVersion: 0 },
  });
  void reconcileCorrections();
  emit('burst', { lane: 'adapted' });
  void loadMetrics();
  setTimeout(() => { if (S().training.phase === 'promoted') S().set({ training: { ...S().training, phase: 'collecting', progress: 0 } }); }, 6000);
}

interface CorrectionRow {
  id?: string; source?: string; versionId?: string | null; rule?: string | null; status?: string; lane?: string;
  badAction?: unknown; goodAction?: unknown; badLabel?: string; goodLabel?: string;
}
interface VersionLike { versionId?: string; id?: string; label: string; createdAt?: string | Date; examples?: number | null; status?: string; promoted?: boolean | null; heldBackReason?: string | null }
function toAdapted(v: VersionLike) {
  return { versionId: v.versionId ?? v.id, label: v.label, examples: v.examples ?? undefined, createdAt: v.createdAt ? String(v.createdAt) : undefined };
}
function latestPromoted(list: VersionLike[]) {
  const ok = list.filter((v) => v.promoted !== false && (v.status === undefined || v.status === 'ready'));
  const v = ok[ok.length - 1];
  return v ? toAdapted(v) : null;
}

// ───────────────────────── Data loading ─────────────────────────

export async function loadMetrics(scope: Scope = S().scope) {
  const raw = await apiSafe<unknown>(`/api/metrics?scope=${scope}`);
  if (!raw) return;
  const obj = (Array.isArray(raw) ? { rows: raw } : raw) as { rows?: unknown[]; curve?: unknown[]; calls?: number; totals?: Totals };
  const { rows, curve } = normalizeMetrics(obj.rows ?? [], obj.curve ?? [], S().adapted.versionId);
  const patch: Partial<ReturnType<typeof S>> = { rows, metricsKey: S().metricsKey + 1 };
  if (curve.length) patch.curve = curve;
  if (obj.calls && obj.calls > S().calls) patch.calls = obj.calls;
  if (obj.totals) {
    patch.counts = { rescues: obj.totals.rescues, examples: obj.totals.examples, sinceVersion: obj.totals.sinceCurrent };
    if (S().training.phase === 'collecting' && obj.totals.sinceCurrent >= REFRESH_MIN_EXAMPLES) patch.training = { ...S().training, phase: 'ready' };
  }
  S().set(patch);
}

export function boot(): Promise<void> {
  return (booting ??= bootOnce());
}

async function bootOnce() {
  // Agent E: D replays public/demo/session-default.json through the real lanes; Shift+R records a live session.
  if (!replayProvider) setReplayProvider(() => startReplay());
  installRecorderHotkey();
  // Agent D: seeds demo data when the DB is empty. Missing route -> ignored.
  await apiSafe('/api/demo/bootstrap', {});
  const [health, versions, corrections] = await Promise.all([
    apiSafe<{ mubit: 'ok' | 'mock' | 'down'; db: string; demoMode: boolean }>('/api/health'),
    apiSafe<VersionLike[]>('/api/versions'),
    apiSafe<CorrectionRow[]>('/api/corrections?limit=500'),
  ]);
  const s = S();
  if (health) s.set({ health, mode: health.demoMode ? 'replay' : s.mode });
  else s.set({ health: { mubit: 'down', db: 'unknown', demoMode: false } });
  if (health?.demoMode) void startReplay();
  if (Array.isArray(versions)) {
    const v = latestPromoted(versions);
    if (v) s.set({ adapted: v });
  }
  if (Array.isArray(corrections)) {
    const rescues = corrections.filter((c) => c.source === 'human').length;
    const since = corrections.filter((c) => !c.versionId).length;
    s.set({ counts: { rescues, examples: corrections.length, sinceVersion: since } });
    // Show the most recent human rescues in the tray (if the API returns their actions).
    const recent: CorrectionView[] = corrections
      .filter((c) => (c.source === 'human' || c.source === 'scripted') && c.goodAction && typeof c.goodAction === 'object')
      .sort((a, b) => Number(b.source === 'human') - Number(a.source === 'human'))
      .slice(0, 5)
      .map((c, i) => ({
        id: c.id ?? `srv_${i}`, lane: (c.lane as LaneId) ?? 'base',
        rule: (c.rule && /^R[1-7]$/.test(c.rule) ? c.rule : c.rule ? 'other' : undefined) as RuleId | 'other' | undefined,
        ruleText: c.rule && !/^R[1-7]$/.test(c.rule) ? c.rule.replace(/^other:/, '') : undefined,
        bad: { action: (c.badAction as AgentAction) ?? { type: 'click', reason: '' }, label: c.badLabel },
        good: { action: c.goodAction as AgentAction, label: c.goodLabel },
        source: c.source === 'scripted' ? 'scripted' as const : 'human' as const,
        augmented: 8, status: c.status === 'trained' || c.versionId ? 'trained' : c.status === 'failed' ? 'failed' : 'sent', landed: true, at: Date.now() - i,
      }));
    if (recent.length && S().corrections.length === 0) s.set({ corrections: recent });
    if (since >= REFRESH_MIN_EXAMPLES) s.set({ training: { phase: 'ready', progress: 0 } });
  }
  await loadMetrics();
}

interface Totals { rescues: number; examples: number; sinceCurrent: number; currentVersion?: string }
interface LaneRow {
  lane: string; versionId: string | null; runs?: number; verifiedSuccess: number | null; bugRecall: number | null; falseAlarms: number | null;
  violationsPerRun: number | null; rescuesPer10: number | null; p50LatencyMs: number | null; costPerRunUsd: number | null; promptChars: number | null;
}
const METRICS: { key: keyof LaneRow; label: string; unit?: string; better: 'higher' | 'lower'; pct?: boolean }[] = [
  { key: 'verifiedSuccess', label: 'Verified success', unit: '%', better: 'higher', pct: true },
  { key: 'bugRecall', label: 'Bug recall', unit: '%', better: 'higher', pct: true },
  { key: 'falseAlarms', label: 'False alarms', better: 'lower' },
  { key: 'violationsPerRun', label: 'Policy violations / run', better: 'lower' },
  { key: 'rescuesPer10', label: 'Rescues / 10 runs', better: 'lower' },
  { key: 'p50LatencyMs', label: 'p50 latency / step', unit: 'ms', better: 'lower' },
  { key: 'costPerRunUsd', label: 'Cost / run', unit: '$', better: 'lower' },
  { key: 'promptChars', label: 'Prompt size', unit: 'chars', better: 'lower' },
];

/** Accepts per-metric ScoreRow[] (already pivoted) or per-lane rows from lib/db/queries (pivots them). */
export function normalizeMetrics(rawRows: unknown[], rawCurve: unknown[], adaptedVersionId?: string): { rows: ScoreRow[]; curve: CurvePoint[] } {
  const isPivoted = rawRows.length > 0 && rawRows.every((r) => !!r && typeof r === 'object' && 'values' in r && 'label' in r);
  let rows: ScoreRow[] = [];
  if (isPivoted) rows = rawRows as ScoreRow[];
  else {
    const lr = rawRows.filter((r): r is LaneRow => !!r && typeof r === 'object' && 'lane' in r);
    const pick = (lane: string): { cur?: LaneRow; prev?: LaneRow } => {
      const xs = lr.filter((r) => r.lane === lane && (r.runs ?? 1) > 0);
      if (lane !== 'adapted' || xs.length <= 1) return { cur: xs[0] };
      const i = Math.max(0, xs.findIndex((r) => r.versionId === adaptedVersionId));
      return { cur: xs[i], prev: xs[i + 1] }; // newest first
    };
    const lanes: LaneId[] = ['closed', 'base', 'adapted', 'icl'];
    const per = Object.fromEntries(lanes.map((l) => [l, pick(l)])) as Record<LaneId, { cur?: LaneRow; prev?: LaneRow }>;
    const val = (r: LaneRow | undefined, m: (typeof METRICS)[number]) => {
      const v = r?.[m.key];
      return typeof v === 'number' ? (m.pct ? v * 100 : v) : null;
    };
    if (lr.length) rows = METRICS.map((m) => ({
      key: m.key, label: m.label, unit: m.unit, better: m.better,
      values: Object.fromEntries(lanes.map((l) => [l, val(per[l].cur, m)])),
      prev: per.adapted.prev ? { adapted: val(per.adapted.prev, m) } : undefined,
    }));
  }
  const curve: CurvePoint[] = [];
  for (const c of rawCurve) {
    if (!c || typeof c !== 'object') continue;
    const o = c as { lane?: string; label?: string; version?: string; corrections?: number; verifiedSuccess?: number | null; success?: number };
    const success = typeof o.success === 'number' ? o.success : typeof o.verifiedSuccess === 'number' ? o.verifiedSuccess * 100 : null;
    if (success === null) continue;
    curve.push({ lane: (o.lane ?? 'adapted') as LaneId, version: o.version ?? o.label ?? '', corrections: o.corrections ?? 0, success });
  }
  return { rows, curve };
}

// ───────────────────────── Hook points for Agent D ─────────────────────────
/** DEMO_MODE replay provider (lib/demo loadRecording). When registered, toggling D into replay calls it. */
type ReplayProvider = () => Promise<void> | void;
let replayProvider: ReplayProvider | null = null;
export function setReplayProvider(p: ReplayProvider | null) { replayProvider = p; }
export function getReplayProvider() { return replayProvider; }

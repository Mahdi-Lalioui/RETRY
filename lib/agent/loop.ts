'use client';
// Client-driven agent loop (plan §9.6). Lanes run concurrently, each with its own AbortController.
import { nanoid } from 'nanoid';
import type { AgentAction, HistoryItem, LaneId, StepResponse, Verdict } from '@/lib/agent/types';
import type { BugId, RuleId, ShopState } from '@/lib/shop/state';
import { LANES } from '@/lib/agent/lanes';
import { detectStuck } from '@/lib/agent/stuck';
import { getTask, TASKS } from '@/lib/shop/tasks';
import { api, apiSafe } from '@/lib/store/api';
import { bridge, waitReady, type Pick } from '@/lib/store/frames';
import { emit } from '@/lib/store/bus';
import { MAX_STEPS, REFRESH_MIN_EXAMPLES } from '@/lib/store/lanes';
import { useMission, type CorrectionView, type CurvePoint, type ScoreRow, type Scope } from '@/lib/store/mission';
import { play } from '@/lib/store/sfx';

const S = () => useMission.getState();
const controllers = new Map<LaneId, AbortController>();
const rescueWaiters = new Map<LaneId, (r: RescueResult | null) => void>();
const usedSeeds = new Set<number>();

export interface RescueResult { pick: Pick; value?: string; rule?: RuleId | 'other'; ruleText?: string }

class Aborted extends Error { constructor() { super('aborted'); } }
const check = (sig: AbortSignal) => { if (sig.aborted) throw new Aborted(); };

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
    return await api<Verdict>('/api/agent/finish', { runId, lane, taskId, finalAction, state, stuck: finalAction === null });
  } catch { return fallback; }
}

function stamp(lane: LaneId, v: Verdict) {
  S().patchLane(lane, (l) => ({ verdict: v, verdictKey: l.verdictKey + 1, status: 'done', thinking: false }));
  emit('stamp', { lane });
  play('thunk');
}

async function runLane(lane: LaneId, sig: AbortSignal) {
  const st = S();
  const task = getTask(st.taskId);
  const runId = `run_${nanoid(10)}`;
  const history: HistoryItem[] = [];
  st.patchLane(lane, { status: 'running', runId, steps: [], verdict: undefined, bug: undefined, latencies: [], costUsd: 0, costKnown: false, promptChars: 0, flash: null, error: undefined, thinking: false });
  let state: ShopState | null = null;
  try {
    for (let stepIdx = 0; stepIdx <= MAX_STEPS; stepIdx++) {
      check(sig);
      const snap = await bridge.snapshot(lane);
      state = snap.state;
      S().patchLane(lane, { layoutTag: snap.layoutTag, thinking: true });
      if (snap.layoutTag && snap.layoutTag !== S().layoutTag) S().set({ layoutTag: snap.layoutTag, layoutFlash: S().layoutFlash + 1 });
      const labels = labelsFromSnapshot(snap.snapshot);
      const res = await api<StepResponse>('/api/agent/step', {
        runId, lane, taskId: task.id, goal: task.goal, snapshot: snap.snapshot,
        history: history.slice(-6), modelRef: modelRefFor(lane), stepIdx,
      }, sig);
      check(sig);
      emit('call', { lane, ms: res.latencyMs });
      S().set({ calls: S().calls + 1 });
      const entry = { idx: stepIdx, action: res.action, label: res.action.target ? labels[res.action.target] : undefined, latencyMs: res.latencyMs, stepId: res.stepId };
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
      const actRes = await bridge.act(lane, res.action);
      check(sig);
      state = actRes.state;
      const after = state?.violations.length ?? 0;
      history.push({ action: res.action, result: actRes.result });
      S().patchLane(lane, (l) => ({ steps: l.steps.map((s) => (s.idx === stepIdx && !s.human ? { ...s, result: actRes.result } : s)), layoutTag: actRes.layoutTag }));
      const newRule = after > before ? (state.violations[after - 1] as RuleId) : undefined;
      if (newRule) { S().patchLane(lane, { flash: newRule }); play('alert'); }

      if (detectStuck(history, before, after, MAX_STEPS)) {
        if (S().mode !== 'live') {
          stamp(lane, await finish(runId, lane, task.id, null, state, { status: newRule ? 'violation' : 'stuck', correct: false, reason: newRule ? `Broke house rule ${newRule}` : 'Agent got stuck', violations: state.violations }));
          return;
        }
        // Live: ask a human.
        S().patchLane(lane, { status: 'rescue' });
        S().set({ rescue: { lane, stepId: res.stepId, badAction: res.action, badLabel: entry.label, autoRule: newRule, rule: newRule, otherText: '', value: '' } });
        bridge.highlight(lane, true);
        const rescue = await new Promise<RescueResult | null>((resolve) => {
          rescueWaiters.set(lane, resolve);
          sig.addEventListener('abort', () => resolve(null), { once: true });
        });
        rescueWaiters.delete(lane);
        bridge.highlight(lane, false);
        if (S().rescue?.lane === lane) S().set({ rescue: null });
        check(sig);
        if (!rescue) {
          stamp(lane, await finish(runId, lane, task.id, null, state, { status: newRule ? 'violation' : 'stuck', correct: false, reason: newRule ? `Broke house rule ${newRule} · rescue skipped` : 'Stuck · rescue skipped', violations: state.violations }));
          return;
        }
        S().patchLane(lane, { status: 'running', flash: null });
        const good: AgentAction = {
          type: rescue.pick.role === 'textbox' ? 'type' : rescue.pick.role === 'select' ? 'select' : 'click',
          target: rescue.pick.id, value: rescue.value || undefined, reason: 'Human rescue',
        };
        void submitCorrection(lane, res.stepId, res.action, entry.label, good, rescue);
        const applied = await bridge.apply(lane, rescue.pick.semKey, rescue.value || undefined);
        state = applied.state;
        history.push({ action: good, result: applied.result });
        S().patchLane(lane, (l) => ({ steps: [...l.steps, { idx: stepIdx, action: good, label: rescue.pick.label, result: applied.result, latencyMs: 0, human: true }] }));
      }
    }
    stamp(lane, await finish(runId, lane, task.id, null, state, { status: 'stuck', correct: false, reason: `Step budget (${MAX_STEPS}) exceeded`, violations: state?.violations ?? [] }));
  } catch (e) {
    if (e instanceof Aborted || sig.aborted) { S().patchLane(lane, { status: S().lanes[lane].verdict ? 'done' : 'idle', thinking: false }); return; }
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
  const rule = r.rule === 'other' ? (r.ruleText ? `other:${r.ruleText}` : undefined) : r.rule;
  try {
    const out = await api<{ correctionId: string; augmented: number | unknown[] }>('/api/corrections', { stepId, goodAction: good, rule });
    const aug = Array.isArray(out.augmented) ? out.augmented.length : Number(out.augmented) || 0;
    patchCorrection(id, { status: 'sent', augmented: aug });
    const c = S().counts;
    S().set({ counts: { rescues: c.rescues + 1, examples: c.examples + 1 + aug, sinceVersion: c.sinceVersion + 1 + aug } });
    const t = S().training;
    if (t.phase === 'collecting' && S().counts.sinceVersion >= REFRESH_MIN_EXAMPLES) S().set({ training: { ...t, phase: 'ready' } });
  } catch {
    patchCorrection(id, { status: 'failed' });
  }
}

export function patchCorrection(id: string, p: Partial<CorrectionView>) {
  S().set({ corrections: S().corrections.map((c) => (c.id === id ? { ...c, ...p } : c)) });
}

/** Called by RescueOverlay. */
export function resolveRescue(lane: LaneId, r: RescueResult | null) {
  rescueWaiters.get(lane)?.(r);
}

// ───────────────────────── Mission actions (hotkeys) ─────────────────────────

export function stopAll() {
  controllers.forEach((c) => c.abort());
  controllers.clear();
  rescueWaiters.forEach((w) => w(null));
  S().activeLanes().forEach((l) => bridge.highlight(l, false));
  S().set({ running: false, rescue: null });
}

function resetFrames() {
  const s = S();
  s.activeLanes().forEach((l) => bridge.reset(l, s.seed, s.versionIndex, s.bugs));
}

export async function runAll() {
  stopAll();
  const s = S();
  s.resetLanes();
  resetFrames();
  s.set({ running: true });
  const lanes = s.activeLanes();
  await new Promise((r) => setTimeout(r, 200));
  await Promise.all(lanes.map(async (lane) => {
    const c = new AbortController();
    controllers.set(lane, c);
    try { await waitReady(lane); } catch (e) { S().patchLane(lane, { error: String(e) }); }
    await runLane(lane, c.signal);
  }));
  if (lanes.every((l) => !controllers.get(l)?.signal.aborted)) S().set({ running: false });
  void loadMetrics();
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
  S().set({ bugs: [bug], breakMenu: false });
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
  S().set({ seed: nextUnseenSeed(), taskId: task.id, bugs: Math.random() < 0.3 ? [bugs[Math.floor(Math.random() * 4)]] : [] });
  await runAll();
}

export function toggleIcl() {
  stopAll();
  S().set({ iclOn: !S().iclOn });
  S().resetLanes();
}

export function toggleDemo() {
  const s = S();
  s.set({ mode: s.mode === 'live' ? 'replay' : 'live', replayAt: new Date().toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) });
}

// ───────────────────────── Training / versions ─────────────────────────

interface StatusRes { phase: 'collecting' | 'training' | 'evaluating' | 'promoted' | 'held_back'; progress?: number; version?: { versionId: string; label: string; examples?: number; createdAt?: string }; reason?: string }
let polling = false;

export async function trainNow() {
  const t = S().training;
  if (polling || t.phase === 'training' || t.phase === 'evaluating') return;
  const startedAt = Date.now();
  S().set({ training: { phase: 'training', progress: 0, startedAt } });
  let jobId: string | null = null;
  try { jobId = (await api<{ jobId: string | null }>('/api/refresh', {})).jobId; } catch { /* automatic mode */ }
  S().set({ training: { ...S().training, jobId } });
  polling = true;
  try {
    for (let i = 0; i < 900; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const st = await apiSafe<StatusRes>(`/api/refresh/status${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ''}`);
      if (!st) continue;
      if (st.phase === 'training' || st.phase === 'collecting') S().set({ training: { ...S().training, phase: 'training', progress: st.progress ?? Math.min(0.95, (Date.now() - startedAt) / 120000) } });
      else if (st.phase === 'evaluating') S().set({ training: { ...S().training, phase: 'evaluating', progress: st.progress ?? 0.5 } });
      else if (st.phase === 'held_back') {
        S().set({ training: { ...S().training, phase: 'held_back', progress: 1, reason: st.reason ?? 'regression on bug detection' } });
        break;
      } else if (st.phase === 'promoted') {
        const secs = Math.round((Date.now() - startedAt) / 1000);
        S().set({ training: { ...S().training, phase: 'evaluating', progress: 1 } });
        await promote(st.version, secs);
        break;
      }
    }
  } finally { polling = false; }
}

async function promote(v: StatusRes['version'], trainSeconds: number) {
  let next = v;
  if (!next) {
    const list = await apiSafe<VersionLike[]>('/api/versions');
    const pick = list ? latestPromoted(list) : null;
    if (pick) next = pick;
  }
  const s = S();
  const label = next?.label ?? `v${(parseInt(s.adapted.label.replace(/\D/g, ''), 10) || 0) + 1}`;
  s.set({
    prevAdaptedLabel: s.adapted.label,
    adapted: { versionId: next?.versionId, label, examples: next?.examples ?? s.counts.examples, createdAt: next?.createdAt },
    flipKey: s.flipKey + 1,
    training: { phase: 'promoted', progress: 1, trainSeconds },
    corrections: s.corrections.map((c) => (c.status === 'sent' || c.status === 'queued' ? { ...c, status: 'trained' } : c)),
    counts: { ...s.counts, sinceVersion: 0 },
  });
  emit('burst', { lane: 'adapted' });
  void loadMetrics();
  setTimeout(() => { if (S().training.phase === 'promoted') S().set({ training: { ...S().training, phase: 'collecting', progress: 0 } }); }, 6000);
}

interface CorrectionRow {
  id?: string; source?: string; versionId?: string | null; rule?: string | null; status?: string; lane?: string;
  badAction?: unknown; goodAction?: unknown; badLabel?: string; goodLabel?: string;
}
interface VersionLike { versionId?: string; id?: string; label: string; createdAt?: string; examples?: number; status?: string; promoted?: boolean }
function latestPromoted(list: VersionLike[]) {
  const ok = list.filter((v) => v.promoted !== false && (v.status === undefined || v.status === 'ready'));
  const v = ok[ok.length - 1];
  return v ? { versionId: v.versionId ?? v.id ?? v.label, label: v.label, examples: v.examples, createdAt: v.createdAt } : null;
}

// ───────────────────────── Data loading ─────────────────────────

export async function loadMetrics(scope: Scope = S().scope) {
  const raw = await apiSafe<unknown>(`/api/metrics?scope=${scope}`);
  if (!raw) return;
  const obj: { rows?: ScoreRow[]; curve?: CurvePoint[]; calls?: number } = Array.isArray(raw) ? { rows: raw as ScoreRow[] } : (raw as { rows?: ScoreRow[]; curve?: CurvePoint[]; calls?: number });
  const rows = (obj.rows ?? []).filter((r): r is ScoreRow => !!r && typeof r === 'object' && 'label' in r && 'values' in r);
  S().set({ rows, curve: obj.curve ?? S().curve, metricsKey: S().metricsKey + 1, ...(obj.calls && obj.calls > S().calls ? { calls: obj.calls } : {}) });
}

export async function boot() {
  const [health, versions, corrections] = await Promise.all([
    apiSafe<{ mubit: 'ok' | 'mock' | 'down'; db: string; demoMode: boolean }>('/api/health'),
    apiSafe<VersionLike[]>('/api/versions'),
    apiSafe<CorrectionRow[]>('/api/corrections?limit=500'),
  ]);
  const s = S();
  if (health) s.set({ health, mode: health.demoMode ? 'replay' : s.mode });
  else s.set({ health: { mubit: 'down', db: 'unknown', demoMode: false } });
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
      .filter((c) => c.source === 'human' && c.goodAction && typeof c.goodAction === 'object')
      .slice(0, 5)
      .map((c, i) => ({
        id: c.id ?? `srv_${i}`, lane: (c.lane as LaneId) ?? 'base',
        rule: (c.rule && /^R[1-7]$/.test(c.rule) ? c.rule : c.rule ? 'other' : undefined) as RuleId | 'other' | undefined,
        ruleText: c.rule && !/^R[1-7]$/.test(c.rule) ? c.rule.replace(/^other:/, '') : undefined,
        bad: { action: (c.badAction as AgentAction) ?? { type: 'click', reason: '' }, label: c.badLabel },
        good: { action: c.goodAction as AgentAction, label: c.goodLabel },
        augmented: 8, status: c.status === 'trained' || c.versionId ? 'trained' : c.status === 'failed' ? 'failed' : 'sent', landed: true, at: Date.now() - i,
      }));
    if (recent.length && S().corrections.length === 0) s.set({ corrections: recent });
    if (since >= REFRESH_MIN_EXAMPLES) s.set({ training: { phase: 'ready', progress: 0 } });
  }
  await loadMetrics();
}

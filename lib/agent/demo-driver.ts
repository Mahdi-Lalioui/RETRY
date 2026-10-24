'use client';
// Agent E: DEMO_MODE replay (D) + live session recorder (Shift+R) for Mission Control (plan §19 / §29).
// Replay drives the real lane iframes through the bridge (retry:reset / retry:act), so every animation is the
// live one; the recording's honestLabel is put in the store (`replayLabel`) for the ReplayBanner.
import type { AgentAction, LaneId } from '@/lib/agent/types';
import type { RuleId } from '@/lib/shop/state';
import { createRecorder, createReplay, loadRecording, type Recorder, type Recording, type RecordingEvent, type Replay } from '@/lib/demo';
import type { EventInput } from '@/lib/demo/recorder';
import { bridge } from '@/lib/store/frames';
import { emit } from '@/lib/store/bus';
import { play } from '@/lib/store/sfx';
import { useMission, type CorrectionView } from '@/lib/store/mission';

const S = () => useMission.getState();

function labelsFromSnapshot(snapshot: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of snapshot.matchAll(/\b(e\d+)\s+\w+\s+"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

// ───────────── replay ─────────────
let replay: Replay | null = null;
let epoch = 0; // bumps on stop so in-flight bridge promises from a stopped replay are ignored

function onEvent(e: RecordingEvent, rec: Recording, my: number) {
  if (my !== epoch || S().mode !== 'replay') return;
  const s = S();
  switch (e.kind) {
    case 'scene': {
      s.resetLanes();
      s.set({ taskId: e.taskId, seed: e.seed, versionIndex: e.versionIndex, bugs: e.bugs, layoutTag: e.layoutTag, layoutFlash: s.layoutFlash + 1, replayCaption: e.caption });
      const ad = e.lanes.find((l) => l.lane === 'adapted');
      if (ad?.versionLabel && ad.versionLabel !== S().adapted.label) S().set({ adapted: { ...S().adapted, label: ad.versionLabel } });
      for (const l of S().activeLanes()) {
        bridge.reset(l, e.seed, e.versionIndex, e.bugs, e.taskId);
        if (e.lanes.some((x) => x.lane === l)) S().patchLane(l, { status: 'running', layoutTag: e.layoutTag });
      }
      break;
    }
    case 'step': {
      const lane = e.lane;
      const labels = labelsFromSnapshot(e.snapshot);
      S().patchLane(lane, (l) => ({
        status: 'running', runId: e.runId, thinking: false,
        steps: [...l.steps, { idx: e.stepIdx, action: e.action, label: e.action.target ? labels[e.action.target] : undefined, latencyMs: e.latencyMs, result: e.result }],
        latencies: [...l.latencies, e.latencyMs], costUsd: l.costUsd + (e.costUsd ?? 0), costKnown: l.costKnown || e.costUsd !== null, promptChars: e.promptChars,
      }));
      emit('call', { lane, ms: e.latencyMs });
      S().set({ calls: S().calls + 1 });
      if (e.action.type !== 'done' && e.action.type !== 'report_bug') {
        void bridge.act(lane, e.action).then((r) => {
          if (my !== epoch) return;
          const before = S().lanes[lane].flash;
          const v = r.state?.violations ?? [];
          if (v.length && !before && e.result) { S().patchLane(lane, { flash: v[v.length - 1] as RuleId }); play('alert'); }
        }).catch(() => { /* frame gone */ });
      }
      break;
    }
    case 'verdict': {
      const steps = S().lanes[e.lane].steps;
      const last = steps[steps.length - 1];
      if (e.verdict.status === 'bug_reported' && last?.action.type === 'report_bug') {
        S().patchLane(e.lane, {
          bug: { evidence: last.action.reason, page: 'checkout', layoutTag: S().layoutTag, seed: S().seed, taskId: S().taskId, bugs: S().bugs,
            steps: steps.slice(0, -1).map((x, i) => `${i + 1}. ${x.action.type}${x.label ? ` "${x.label}"` : ''} → ${x.result ?? 'ok'}`) },
        });
      }
      S().patchLane(e.lane, (l) => ({ verdict: e.verdict, verdictKey: l.verdictKey + 1, status: 'done', thinking: false }));
      emit('stamp', { lane: e.lane });
      play('thunk');
      break;
    }
    case 'correction': {
      const id = `rep_${e.at}_${e.lane}`;
      const view: CorrectionView = {
        id, lane: e.lane, rule: e.rule && e.rule !== 'BUG' ? e.rule : undefined,
        bad: { action: e.badAction ?? ({ type: 'click', reason: '' } as AgentAction) }, good: { action: e.goodAction },
        augmented: e.augmented, status: 'sent', landed: false, at: Date.now(),
      };
      S().set({ corrections: [view, ...S().corrections].slice(0, 12) });
      emit('card', { id, lane: e.lane });
      break;
    }
    case 'version': {
      if (e.phase === 'promoted') {
        const prev = S().adapted.label;
        S().set({ prevAdaptedLabel: prev, adapted: { ...S().adapted, label: e.label, examples: e.examples }, flipKey: S().flipKey + 1, training: { phase: 'promoted', progress: 1 } });
        emit('burst', { lane: 'adapted' });
      } else if (e.phase === 'held_back') {
        S().set({ training: { phase: 'held_back', progress: 1, reason: e.headline } });
      } else {
        S().set({ training: { phase: e.phase === 'evaluating' ? 'evaluating' : 'training', progress: e.progress } });
      }
      break;
    }
    case 'caption': S().set({ replayCaption: e.text }); break;
  }
  void rec;
}

export async function startReplay(name = 'session-default') {
  stopReplay();
  const my = ++epoch;
  let rec: Recording;
  try { rec = await loadRecording(name); } catch (err) {
    S().set({ replayLabel: `Replay unavailable: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }
  if (my !== epoch || S().mode !== 'replay') return;
  const when = new Date(rec.recordedAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  S().set({ replayLabel: rec.honestLabel, replayAt: when, replayTitle: rec.title, replayCaption: undefined });
  replay = createReplay(rec, { onEvent: (e, r) => onEvent(e, r, my), onEnd: () => { if (my === epoch) S().set({ replayCaption: 'End of recording · press D for live' }); } });
  replay.play();
}

export function stopReplay() {
  epoch++;
  replay?.stop();
  replay = null;
}

// ───────────── recorder (Shift+R) ─────────────
let recorder: Recorder | null = null;

export function isRecordingSession() { return !!recorder; }

/** Called from the live loop at each event; no-op unless Shift+R recording is on. */
export function recordEvent(e: EventInput) {
  if (!recorder) return;
  try { recorder.add(e); } catch { /* ignore */ }
}

export function toggleRecorder(): Recording | null {
  if (!recorder) {
    const mubit = S().health.mubit;
    recorder = createRecorder({ title: 'RETRY — live Mission Control session', source: 'live', mubitMode: mubit === 'ok' ? 'real' : 'mock', timing: 'real' });
    S().set({ recording: true });
    recorder.add({ kind: 'caption', text: 'Live session recording started.' });
    return null;
  }
  const out = recorder.finish();
  recorder = null;
  S().set({ recording: false });
  try {
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `session-${out.id.replace(/^rec_/, '')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch { /* non-DOM */ }
  return out;
}

let hotkeyInstalled = false;
/** Shift+R toggles the live recorder (download on stop). Installed from boot(); Hotkeys.tsx stays untouched. */
export function installRecorderHotkey() {
  if (hotkeyInstalled || typeof window === 'undefined') return;
  hotkeyInstalled = true;
  window.addEventListener('keydown', (e) => {
    if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'r') return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    toggleRecorder();
  }, { capture: true });
}

export type { LaneId };

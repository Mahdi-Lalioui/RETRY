// plan §19 — record public/demo/session-default.json by running the SIMULATOR (honestly labelled "simulator run",
// "simulated timings", "mock model" when on the mock). Usage: npm run record:demo [-- out.json]
import './env';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { LaneId, Verdict } from '@/lib/agent/types';
import type { BugId, ShopState } from '@/lib/shop/state';
import { simulateRun } from '@/lib/agent/sim';
import { LANES } from '@/lib/agent/lanes';
import { getTask } from '@/lib/shop/tasks';
import { initialState, act } from '@/lib/shop/engine';
import { solveStep } from '@/lib/shop/solver';
import { renderSnapshot } from '@/lib/shop/snapshot';
import { buildMessages } from '@/lib/agent/prompt';
import { repo } from '@/lib/db';
import { mubitMode } from '@/lib/mubit';
import { withMockFast } from '@/lib/mubit/mock';
import { ensureBootstrap } from '@/lib/train/bootstrap';
import { augmentCorrection } from '@/lib/train/augment';
import { startRefresh, refreshStatus } from '@/app/api/_lib/refresh';
import { sendCorrection } from '@/app/api/_lib/feedback';
import { createRecorder } from '@/lib/demo/recorder';

const ANIM_MS = 700;           // executor animation budget per step (cursor move + click)
const LANES_SHOWN: LaneId[] = ['closed', 'base', 'adapted'];

async function main() {
  process.env.MOCK_TRAIN_SECONDS = '0';
  await ensureBootstrap();
  const mode = mubitMode();
  const rec = createRecorder({ title: 'RETRY — default stage session', source: 'simulator', mubitMode: mode, timing: 'simulated' });

  async function scene(id: string, title: string, caption: string, taskId: string, seed: number, versionIndex: number, bugs: BugId[]) {
    const task = getTask(taskId);
    const start = rec.now();
    const init = initialState(seed, versionIndex, bugs, { collectRequired: task.wantsCollect });
    const versionLabel = (await repo.versions.current()).label;
    rec.add({ kind: 'scene', sceneId: id, title, caption, taskId, goal: task.goal, seed, versionIndex, bugs, layoutTag: init.layout.layoutTag,
      lanes: LANES_SHOWN.map((l) => ({ lane: l, label: LANES[l].label, versionLabel: l === 'adapted' ? versionLabel : l === 'base' ? 'v1' : '' })) });
    let end = start;
    const results: Record<string, { verdict: Verdict; runId: string; states: ShopState[] }> = {};
    for (const lane of LANES_SHOWN) {
      const r = await withMockFast(() => simulateRun({ task, seed, versionIndex, bugs, lane, runId: `rec_${id}_${lane}` }));
      let t = start + 1200;
      let s = init; const states: ShopState[] = [];
      for (const st of r.steps) {
        t += st.latencyMs;
        rec.add({ kind: 'step', at: t, sceneId: id, lane, runId: r.runId, stepIdx: st.idx, action: st.action, result: st.result,
          latencyMs: st.latencyMs, costUsd: st.costUsd, promptChars: st.promptChars, snapshot: st.snapshot });
        states.push(s);
        if (st.action.type !== 'done' && st.action.type !== 'report_bug') s = act(s, st.action).state;
        t += ANIM_MS;
      }
      rec.add({ kind: 'verdict', at: t + 200, sceneId: id, lane, runId: r.runId, verdict: r.verdict, steps: r.steps.length });
      results[lane] = { verdict: r.verdict, runId: r.runId, states: [...states, s] };
      end = Math.max(end, t + 200);
    }
    rec.advance(end - rec.now() + 2500);
    return results;
  }

  rec.add({ kind: 'caption', text: 'Three lanes, one QA ticket, every call routed through Mubit.' });
  rec.advance(1500);
  const s1 = await scene('pain', 'The pain', 'Base v1 does not know the house rules', 'T2', 9001, 1, []);

  // Rescue the base lane at its violation (scripted rescue in the recording; labelled as such).
  const base = s1.base;
  if (!base.verdict.correct) {
    const task = getTask('T2');
    const states = base.states;
    const before = states[Math.max(0, states.length - 2)];
    const good = solveStep(task, before);
    const msgs = buildMessages({ goal: task.goal, history: [], snapshot: renderSnapshot(before), lane: 'base' });
    const c = await repo.corrections.insert({ source: 'scripted', rule: base.verdict.violations[0] ?? null, goal: task.goal, messages: msgs, badAction: null, goodAction: good, semKey: null, seed: 9001, status: 'queued', lane: 'base' });
    const aug = await augmentCorrection(c, null, { state: before, history: [] });
    for (const a of aug) await sendCorrection(await repo.corrections.insert(a), null);
    await sendCorrection(c, null);
    rec.add({ kind: 'correction', sceneId: 'pain', lane: 'base', rule: (base.verdict.violations[0] ?? null) as never, source: 'scripted', badAction: null, goodAction: good, augmented: aug.length, correctionId: c.id });
    rec.add({ kind: 'caption', text: `That rescue is now a training example — re-rendered across ${aug.length} layouts.` });
    rec.advance(2500);
    await new Promise((r) => setTimeout(r, 5));
    const job = await startRefresh();
    rec.add({ kind: 'version', phase: 'training', label: '…', progress: 0 });
    for (const p of [0.25, 0.5, 0.75]) { rec.advance(1500); rec.add({ kind: 'version', phase: 'training', label: '…', progress: p }); }
    let st = await refreshStatus(job.versionId);
    for (let i = 0; i < 10 && (st.phase === 'training' || st.phase === 'evaluating'); i++) st = await refreshStatus(job.versionId);
    rec.advance(1500); rec.add({ kind: 'version', phase: 'evaluating', label: st.version?.label ?? '?', progress: 0.5, examples: st.version?.examples ?? 0 });
    rec.advance(2500);
    rec.add({ kind: 'version', phase: st.phase === 'held_back' ? 'held_back' : 'promoted', label: st.version?.label ?? '?', progress: 1, examples: st.version?.examples ?? 0, headline: st.gate?.headline });
    rec.advance(3000);
  }

  rec.add({ kind: 'caption', text: "Judge's turn: unseen seed, new layout." });
  rec.advance(1500);
  await scene('judge', "Judge's turn", 'Unseen layout · RETRY vs GPT', 'T5', 10007, 2, []);
  rec.add({ kind: 'caption', text: 'Break checkout: the total shows £NaN.' });
  rec.advance(1500);
  await scene('bug', 'Real regression', 'Still catches real bugs', 'T6', 10011, 2, ['total_nan']);

  const out = rec.finish();
  const file = process.argv[2] ?? path.join(process.cwd(), 'public', 'demo', 'session-default.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(out));
  console.log(`wrote ${file}: ${out.events.length} events, ${(out.durationMs / 1000).toFixed(1)}s — "${out.honestLabel}"`);
}
main().catch((e) => { console.error(e); process.exit(1); });

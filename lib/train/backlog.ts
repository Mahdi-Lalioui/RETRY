// plan §12.3 — honest, scripted overnight backlog. Runs base v1 over TRAINING seeds (1–200) with the simulator; at each
// rule violation / missed bug / stuck point the solver supplies the correct action. These are labelled source:'scripted'
// (never 'human') and then augmented ×8 like any rescue. R7 is never produced (held back for the live demo).
import type { AgentAction, HistoryItem, Task } from '@/lib/agent/types';
import type { BugId, ShopState } from '@/lib/shop/state';
import type { Msg } from '@/lib/mubit/types';
import { TASKS } from '@/lib/shop/tasks';
import { bugsAffecting, BUG_IDS } from '@/lib/shop/bugs';
import { act, initialState, resolveTarget } from '@/lib/shop/engine';
import { renderSnapshot } from '@/lib/shop/snapshot';
import { solveStep } from '@/lib/shop/solver';
import { decide } from '@/lib/agent/policy';
import { LANES } from '@/lib/agent/lanes';
import { TRAINING_SEEDS } from '@/lib/eval/suite';
import { detectRescue, type RescueKind, type RescueRule } from './detect';
import type { HistoryWithState } from './augment';

export interface ScriptedRescue {
  seed: number; task: Task; bugs: BugId[]; state: ShopState; history: HistoryWithState[]; messages: Msg[];
  badAction: AgentAction; goodAction: AgentAction; rule: RescueRule; kind: RescueKind; semKey: string | null; why: string;
}

export interface BacklogOpts { perRuleCap?: number; bugCap?: number; stuckCap?: number; maxSeeds?: number }

/** Bug for a training seed: every third seed is broken, rotating through the bugs that can manifest on its task. */
export function bugsForSeed(seed: number, task: Task): BugId[] {
  if (seed % 3 !== 0) return [];
  const valid = BUG_IDS.filter((b) => bugsAffecting(task, [b]).length);
  return [valid[Math.floor(seed / 3) % valid.length]];
}

export async function collectBacklog(o: BacklogOpts = {}): Promise<ScriptedRescue[]> {
  const perRuleCap = o.perRuleCap ?? 6, bugCap = o.bugCap ?? 14, stuckCap = o.stuckCap ?? 4;
  const out: ScriptedRescue[] = [];
  const count = (r: RescueRule) => out.filter((x) => x.rule === r).length;
  const capFor = (p: { rule: RescueRule }) => (p.rule === 'BUG' ? bugCap : p.rule === null ? stuckCap : perRuleCap);
  const full = () => (['R1', 'R2', 'R3', 'R4', 'R5', 'R6'] as const).every((r) => count(r) >= perRuleCap) && count('BUG') >= bugCap;
  const modelRef = LANES.base.modelRef();
  const maxSeed = Math.min(TRAINING_SEEDS.max, o.maxSeeds ?? TRAINING_SEEDS.max);

  for (let seed = TRAINING_SEEDS.min; seed <= maxSeed && !full(); seed++) {
    const task = TASKS[(seed * 5) % TASKS.length];
    const bugs = bugsForSeed(seed, task);
    let state = initialState(seed, 1, bugs, { collectRequired: task.wantsCollect });
    const history: HistoryWithState[] = [];
    for (let idx = 0; idx < 24; idx++) {
      const snapshot = renderSnapshot(state);
      const plain: HistoryItem[] = history.map(({ action, result }) => ({ action, result }));
      const res = await decide({ runId: `backlog_${seed}`, lane: 'base', taskId: task.id, goal: task.goal, snapshot, history: plain, modelRef, stepIdx: idx });
      let action = res.action;
      let p = detectRescue(task, state, action, plain);
      const prev = history[history.length - 1];
      if (!p && action.type === 'scroll' && prev?.action.type === 'scroll') {
        p = { rule: null, kind: 'stuck', goodAction: solveStep(task, state), why: 'Scrolling without progress' };
      }
      if (p) {
        if (count(p.rule) < capFor(p)) {
          out.push({
            seed, task, bugs, state, history: history.map((h) => ({ ...h })), messages: res.messages, badAction: action,
            goodAction: p.goodAction, rule: p.rule, kind: p.kind, why: p.why,
            semKey: p.goodAction.target ? resolveTarget(state, p.goodAction.target) ?? null : null,
          });
        }
        action = p.goodAction; // the rescue continues the run with the right move
      }
      if (action.type === 'done' || action.type === 'report_bug') break;
      const r = act(state, action);
      history.push({ action, result: r.result, state });
      state = r.state;
      if (full()) break;
    }
  }
  return out;
}

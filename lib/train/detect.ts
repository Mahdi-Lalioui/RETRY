// Pure (client + server): is this agent action a "stuck point" that needs a rescue, and what is the right move?
// The right move comes from the shop's ideal solver (lib/shop/solver.ts) — the policy an expert who knows every
// house rule would follow. Used by the scripted overnight backlog and by the /corrections Rescue queue.
import type { AgentAction, HistoryItem, Task } from '@/lib/agent/types';
import type { RuleId, ShopState } from '@/lib/shop/state';
import { act, resolveTarget } from '@/lib/shop/engine';
import { solveStep } from '@/lib/shop/solver';
import { TEST_COUPON } from '@/lib/shop/rules';

export type RescueRule = RuleId | 'BUG' | null;
export type RescueKind = 'violation' | 'bug_missed' | 'false_alarm' | 'stuck';
export interface RescuePoint { rule: RescueRule; kind: RescueKind; goodAction: AgentAction; why: string }

const same = (a: AgentAction, b: AgentAction) => a.type === b.type && a.target === b.target && (a.value ?? '') === (b.value ?? '');

export function detectRescue(task: Task, state: ShopState, action: AgentAction, history: HistoryItem[]): RescuePoint | null {
  const ideal = solveStep(task, state);
  if (ideal.type === 'report_bug' && action.type !== 'report_bug') {
    return { rule: 'BUG', kind: 'bug_missed', goodAction: ideal, why: `Missed a visible bug: ${ideal.reason}` };
  }
  if (action.type === 'report_bug' && ideal.type !== 'report_bug') {
    return { rule: null, kind: 'false_alarm', goodAction: ideal, why: 'False alarm on a healthy checkout' };
  }
  const semKey = action.target ? resolveTarget(state, action.target) : undefined;
  if (action.type === 'click' && (semKey === 'checkout.ship.standard' || semKey === 'checkout.ship.express')) {
    return { rule: 'R3', kind: 'violation', goodAction: ideal, why: 'UK test orders use Collect in store' };
  }
  if (action.type === 'type' && semKey === 'checkout.coupon.input' && (action.value ?? '').trim().toUpperCase() !== TEST_COUPON) {
    return { rule: 'R2', kind: 'violation', goodAction: ideal, why: `Test coupon is ${TEST_COUPON}` };
  }
  const r = act(state, action);
  const fresh = r.state.violations.slice(state.violations.length);
  if (fresh.length) return { rule: fresh[0], kind: 'violation', goodAction: ideal, why: `Broke house rule ${fresh[0]}` };
  if (action.type === 'done' && ideal.type !== 'done') return { rule: null, kind: 'stuck', goodAction: ideal, why: 'Declared done too early' };
  if (r.result === 'invalid') return { rule: null, kind: 'stuck', goodAction: ideal, why: 'Invalid action' };
  const last = history[history.length - 1];
  if (r.result === 'no_effect' && last && last.result === 'no_effect' && same(last.action, action)) {
    return { rule: null, kind: 'stuck', goodAction: ideal, why: 'Repeating an action that does nothing' };
  }
  return null;
}

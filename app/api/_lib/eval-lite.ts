// OWNED BY AGENT D — minimal working held-out eval created by Agent B; replace with lib/eval/{suite,runner,metrics,gate}.
import { TASKS } from '@/lib/shop/tasks';
import type { BugId } from '@/lib/shop/state';
import type { LaneId } from '@/lib/agent/types';
import { simulateRun } from '@/lib/agent/sim';
import { LANES } from '@/lib/agent/lanes';
import { repo, type Eval } from '@/lib/db';
import { aggregateRuns } from '@/lib/db/queries';

export interface EvalConfig { lane: LaneId; versionId: string | null; suite: 'heldout' | 'smoke' }
export interface SuiteItem { taskId: string; seed: number; bugs: BugId[] }
const BUGS: BugId[] = ['pay_button_dead', 'total_nan', 'no_order_id', 'coupon_500'];
export const CHUNK = 8;

export function suiteItems(suite: 'heldout' | 'smoke'): SuiteItem[] {
  const n = suite === 'heldout' ? 48 : 4;
  const items = Array.from({ length: n }, (_, i) => ({
    taskId: TASKS[i % TASKS.length].id, seed: 9000 + i, bugs: i % 3 === 0 ? [BUGS[(i / 3) % 4]] : [],
  }));
  if (items.some((x) => x.seed < 9000 || x.seed > 9047)) throw new Error('held-out seeds must be 9000–9047');
  return items;
}

export async function advanceEval(ev: Eval): Promise<Eval> {
  const m = (ev.metrics ?? {}) as { config?: EvalConfig };
  const config = m.config;
  if (!config) return ev;
  const items = suiteItems(config.suite);
  const done = ev.done ?? 0;
  if (done >= items.length) return ev;
  const slice = items.slice(done, done + CHUNK);
  await Promise.all(slice.map((it, k) => simulateRun({
    task: TASKS.find((t) => t.id === it.taskId)!, seed: it.seed, versionIndex: 1, bugs: it.bugs, lane: config.lane,
    modelRef: config.versionId ? { ...LANES[config.lane].modelRef(), versionId: config.versionId } : undefined, persist: true, evalId: ev.id, runId: `${ev.id}_${done + k}`,
  }).catch((e) => console.error('[eval]', (e as Error).message))));
  const newDone = Math.min(items.length, done + slice.length);
  const runs = await repo.runs.list({ evalId: ev.id });
  const partial = { ...aggregateRuns(config.lane, runs), versionId: config.versionId };
  return (await repo.evals.update(ev.id, { done: newDone, metrics: newDone >= items.length ? partial : { config, partial } })) ?? ev;
}

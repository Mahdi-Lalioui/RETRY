// plan §13.1 + §12.2 — frozen held-out suite and disjoint seed pools (asserted).
import type { BugId } from '@/lib/shop/state';
import { TASKS } from '@/lib/shop/tasks';
import { bugsAffecting } from '@/lib/shop/bugs';

export const TRAINING_SEEDS = { min: 1, max: 200 } as const;
export const HELDOUT_SEEDS = { min: 9000, max: 9047 } as const;
export const JUDGE_SEED_MIN = 10000;

export type SeedPool = 'training' | 'heldout' | 'judge' | 'none';
export function seedPool(seed: number): SeedPool {
  if (seed >= TRAINING_SEEDS.min && seed <= TRAINING_SEEDS.max) return 'training';
  if (seed >= HELDOUT_SEEDS.min && seed <= HELDOUT_SEEDS.max) return 'heldout';
  if (seed >= JUDGE_SEED_MIN) return 'judge';
  return 'none';
}

export function assertDisjointPools(): void {
  const r = [TRAINING_SEEDS, HELDOUT_SEEDS, { min: JUDGE_SEED_MIN, max: Number.MAX_SAFE_INTEGER }];
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    if (r[i].min <= r[j].max && r[j].min <= r[i].max) throw new Error('seed pools overlap');
  }
}

export interface SuiteItem { idx: number; taskId: string; seed: number; bugs: BugId[] }
export type SuiteName = 'heldout' | 'smoke';

const COUPON_TASKS = TASKS.filter((t) => t.wantsCoupon).map((t) => t.id);      // T2 T6 T8 T11
const OTHER_TASKS = TASKS.filter((t) => !t.wantsCoupon).map((t) => t.id);      // 8 tasks
const NON_COUPON_BUGS: BugId[] = ['pay_button_dead', 'total_nan', 'no_order_id'];

let cached: SuiteItem[] | null = null;

/**
 * 48 runs = 12 tasks × 4 rounds; run i uses held-out seed 9000+i. 16 runs carry one bug (4 of each type):
 * each round puts coupon_500 on one coupon task and the other three bugs on three distinct non-coupon tasks,
 * so every injected bug actually manifests for its task (bugsAffecting).
 */
export function heldoutSuite(): SuiteItem[] {
  if (cached) return cached;
  assertDisjointPools();
  const items: SuiteItem[] = [];
  for (let round = 0; round < 4; round++) {
    const bugFor = new Map<string, BugId>();
    bugFor.set(COUPON_TASKS[round % COUPON_TASKS.length], 'coupon_500');
    NON_COUPON_BUGS.forEach((b, j) => bugFor.set(OTHER_TASKS[(3 * round + j) % OTHER_TASKS.length], b));
    TASKS.forEach((t, k) => {
      const idx = round * TASKS.length + k;
      const b = bugFor.get(t.id);
      items.push({ idx, taskId: t.id, seed: HELDOUT_SEEDS.min + idx, bugs: b ? [b] : [] });
    });
  }
  validateSuite(items);
  cached = items;
  return items;
}

export function validateSuite(items: SuiteItem[]): void {
  if (items.length !== 48) throw new Error(`held-out suite must have 48 runs, has ${items.length}`);
  const seeds = new Set(items.map((i) => i.seed));
  if (seeds.size !== items.length) throw new Error('held-out seeds must be unique');
  for (const it of items) {
    if (seedPool(it.seed) !== 'heldout') throw new Error(`seed ${it.seed} is not a held-out seed`);
    const task = TASKS.find((t) => t.id === it.taskId)!;
    if (bugsAffecting(task, it.bugs).length !== it.bugs.length) throw new Error(`bug ${it.bugs} cannot manifest on ${it.taskId}`);
  }
  const bugRuns = items.filter((i) => i.bugs.length).length;
  if (bugRuns !== 16) throw new Error(`held-out suite must have 16 bug runs, has ${bugRuns}`);
}

/** 4-run smoke suite: 3 healthy + 1 bug, drawn from the held-out suite. */
export function smokeSuite(): SuiteItem[] {
  const h = heldoutSuite();
  return [...h.filter((i) => !i.bugs.length).slice(0, 3), h.find((i) => i.bugs.length)!].map((x, idx) => ({ ...x, idx }));
}

export function suiteItems(name: SuiteName): SuiteItem[] {
  return name === 'heldout' ? heldoutSuite() : smokeSuite();
}

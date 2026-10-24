// Agent G QA matrix: every task × layout v1..v8 × many seeds (incl. ≥10000), solver + fully-learned mock.
import { describe, it, expect, beforeAll } from 'vitest';
import { TASKS } from '@/lib/shop/tasks';
import { initialState, act } from '@/lib/shop/engine';
import { renderSnapshot } from '@/lib/shop/snapshot';
import { judge } from '@/lib/shop/oracle';
import { solveStep } from '@/lib/shop/solver';
import { bugsAffecting } from '@/lib/shop/bugs';
import { simulateRun } from '@/lib/agent/sim';
import { resetMemoryRepo } from '@/lib/db';
import type { BugId } from '@/lib/shop/state';

process.env.MOCK_LATENCY_SCALE = '0';
process.env.MUBIT_ENABLED = 'false';
delete process.env.DATABASE_URL;

const SEEDS = [1, 7, 42, 199, 9000, 9047, 10000, 10001, 12345, 31337, 99999];
const BUGS: BugId[] = ['pay_button_dead', 'total_nan', 'no_order_id', 'coupon_500'];

function solve(taskId: string, seed: number, v: number, bugs: BugId[]) {
  const task = TASKS.find((t) => t.id === taskId)!;
  let s = initialState(seed, v, bugs, { collectRequired: task.wantsCollect });
  for (let i = 0; i < 40; i++) {
    renderSnapshot(s);
    const a = solveStep(task, s);
    if (a.type === 'done' || a.type === 'report_bug') return judge(task, s, a);
    s = act(s, a).state;
  }
  return judge(task, s, null, { stuck: true });
}

describe('matrix: solver', () => {
  it('passes every healthy task × layout × seed and reports every affecting bug', () => {
    const fails: string[] = [];
    for (const t of TASKS) for (let v = 1; v <= 8; v++) for (const seed of SEEDS) {
      const h = solve(t.id, seed, v, []);
      if (h.status !== 'passed') fails.push(`${t.id} v${v} s${seed} healthy → ${h.status} ${h.reason}`);
      for (const b of BUGS) {
        if (!bugsAffecting(t, [b]).length) continue;
        const r = solve(t.id, seed, v, [b]);
        if (r.status !== 'bug_reported') fails.push(`${t.id} v${v} s${seed} ${b} → ${r.status} ${r.reason}`);
      }
    }
    expect(fails).toEqual([]);
  });
});

describe('matrix: fully-learned mock', () => {
  beforeAll(async () => {
    const repo = resetMemoryRepo();
    await repo.versions.insert({ id: 'vAll', label: 'v9', baseModel: 'open-base', examples: 99, status: 'ready', promoted: true, rules: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'BUG'] });
    await repo.versions.promote('vAll');
  });
  it('passes ≥95% of healthy runs, ≤16 steps, no crashes; catches bugs', async () => {
    let n = 0, pass = 0, bugN = 0, bugOk = 0, falseAlarm = 0;
    const bad: string[] = [];
    for (const t of TASKS) for (let v = 1; v <= 8; v++) for (const seed of SEEDS) {
      const r = await simulateRun({ task: t, seed, versionIndex: v, bugs: [], lane: 'adapted' });
      n++; expect(r.steps.length).toBeLessThanOrEqual(16);
      if (r.verdict.status === 'passed') pass++; else bad.push(`${t.id} v${v} s${seed} ${r.verdict.status} ${r.verdict.reason}`);
      if (r.verdict.status === 'bug_reported' || r.verdict.status === 'false_alarm') falseAlarm++;
      const b = BUGS[(seed + v) % 4];
      if (bugsAffecting(t, [b]).length) {
        const rb = await simulateRun({ task: t, seed, versionIndex: v, bugs: [b], lane: 'adapted' });
        bugN++; if (rb.verdict.status === 'bug_reported') bugOk++;
      }
    }
    console.log(`[matrix] learned healthy ${pass}/${n} bugs ${bugOk}/${bugN} falseAlarms ${falseAlarm}; first fails:`, bad.slice(0, 8));
    expect(falseAlarm).toBe(0);
    expect(pass / n).toBeGreaterThanOrEqual(0.95);
    expect(bugOk / bugN).toBeGreaterThanOrEqual(0.95);
  }, 120000);
});

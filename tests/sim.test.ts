// NEEDS AGENT A's real lib/shop (engine, snapshot, oracle, tasks). Runs against stubs in Agent B's worktree.
import { describe, it, expect, beforeEach } from 'vitest';
import { simulateRun } from '@/lib/agent/sim';
import { getTask } from '@/lib/shop/tasks';
import { resetMemoryRepo } from '@/lib/db';
import type { RuleId } from '@/lib/shop/state';

process.env.MOCK_LATENCY_SCALE = '0';
process.env.MUBIT_ENABLED = 'false';
delete process.env.DATABASE_URL;

async function learnedVersion(rules: (RuleId | 'BUG')[]) {
  const repo = resetMemoryRepo();
  await repo.versions.insert({ id: 'vX', label: 'v2', baseModel: 'open-base', examples: 50, status: 'ready', promoted: true, rules });
  await repo.versions.promote('vX');
  return repo;
}

describe('simulateRun (mock client)', () => {
  beforeEach(() => { resetMemoryRepo(); });

  it('base lane violates a house rule on T2', async () => {
    const r = await simulateRun({ task: getTask('T2'), seed: 9001, versionIndex: 1, bugs: [], lane: 'base' });
    expect(r.verdict.correct).toBe(false);
    expect(r.verdict.status).toBe('violation');
  });

  it('adapted lane with all rules learned passes T1 and T2', async () => {
    await learnedVersion(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'BUG']);
    for (const id of ['T1', 'T2']) {
      const r = await simulateRun({ task: getTask(id), seed: 9002, versionIndex: 1, bugs: [], lane: 'adapted', persist: true });
      expect(r.verdict.status, JSON.stringify(r.steps.map((s) => s.action))).toBe('passed');
      expect(r.steps.length).toBeLessThanOrEqual(16);
    }
  });

  it('learned BUG version reports a coupon_500 bug', async () => {
    await learnedVersion(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'BUG']);
    const r = await simulateRun({ task: getTask('T2'), seed: 9003, versionIndex: 1, bugs: ['coupon_500'], lane: 'adapted' });
    expect(r.verdict.status).toBe('bug_reported');
    expect(r.verdict.correct).toBe(true);
  });
});

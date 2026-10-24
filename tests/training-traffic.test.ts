import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT } from '@/lib/agent/prompt';
import type { ChatRes } from '@/lib/mubit/types';
import { bugsAffecting } from '@/lib/shop/bugs';
import { getTask } from '@/lib/shop/tasks';
import { generateTrainingSamples, runTrainingTraffic, trainingTrafficSummary } from '@/lib/train/traffic';

const response = (text = '{"type":"done","reason":"Order confirmed"}'): ChatRes => ({
  text, callId: 'mreq_real_response', usage: { in: 123, out: 17 }, latencyMs: 42,
});

describe('bounded real-gateway training traffic', () => {
  it('uses deterministic distinct training inputs with healthy and visibly broken checkpoints', () => {
    const samples = generateTrainingSamples(60);
    expect(samples).toEqual(generateTrainingSamples(60));
    expect(new Set(samples.map((s) => s.seed)).size).toBe(60);
    expect(samples.every((s) => s.seed >= 1 && s.seed <= 200)).toBe(true);
    expect(new Set(samples.map((s) => s.taskId)).size).toBe(12);
    expect(new Set(samples.map((s) => s.page)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(samples.map((s) => s.messages.find((m) => m.role === 'user')?.content)).size).toBe(60);
    expect(samples.filter((s) => s.expectedAction.type === 'report_bug').length).toBeGreaterThanOrEqual(15);
    expect(new Set(samples.flatMap((s) => s.bugs)).size).toBe(4);
    for (const sample of samples) {
      expect(sample.messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT });
      expect(sample.source).toBe('scripted-state-real-gateway-output');
      expect(bugsAffecting(getTask(sample.taskId), sample.bugs)).toEqual(sample.bugs);
      expect(sample.messages.some((m) => m.role === 'assistant')).toBe(false);
      expect(sample.snapshot).not.toContain('giftwrap');
    }
  });

  it.each([0, -1, 201, 1.5, NaN])('rejects an unbounded example count %s before sending traffic', (examples) => {
    expect(() => generateTrainingSamples(examples)).toThrow(/1.*200/);
  });

  it('defaults to 60 and permits exactly the full 200-seed training pool', () => {
    expect(generateTrainingSamples()).toHaveLength(60);
    const samples = generateTrainingSamples(200);
    expect(samples).toHaveLength(200);
    expect(samples.at(-1)?.seed).toBe(200);
    expect(new Set(samples.map((s) => s.seed)).size).toBe(200);
  });

  it('records provider evidence and invalid output separately without claiming training success', async () => {
    let index = 0;
    const report = await runTrainingTraffic({
      chat: async () => index++ === 0 ? response() : response('not JSON'),
    }, { examples: 2, model: 'gpt-4o-mini' });
    expect(report).toMatchObject({ requested: 2, attempted: 2, completed: 2, validOutputs: 1, invalidOutputs: 1, providerErrors: 0 });
    expect(report).toMatchObject({ requestedModel: 'gpt-4o-mini' });
    expect(report.records[0]).toMatchObject({ requestedModel: 'gpt-4o-mini', callId: 'mreq_real_response', usage: { in: 123, out: 17 }, latencyMs: 42, status: 'ok', parseOk: true });
    expect(report).not.toHaveProperty('model');
    expect(report.records[0]).not.toHaveProperty('model');
    expect(report.records[0].messages[0].content).toBe(SYSTEM_PROMPT);
    expect(report.records[0].localId).toMatch(/^retry-training-/);
    expect(report.records[1]).toMatchObject({ status: 'invalid_output', parseOk: false, action: null, raw: 'not JSON' });
    expect(trainingTrafficSummary(report)).toMatch(/console.*review.*train.*serv/i);
    expect(trainingTrafficSummary(report)).toMatch(/actual served model.*adapter identity/);
    expect(trainingTrafficSummary(report)).not.toMatch(/trained|kept|promoted|all.*success/i);
  });

  it('caps concurrency at three even when more is requested and preserves the requested model and stable prompts', async () => {
    let active = 0;
    let peak = 0;
    const report = await runTrainingTraffic({ chat: async (req) => {
      if (req.model !== 'gpt-4o-mini' || req.messages[0].content !== SYSTEM_PROMPT || req.metadata !== undefined || req.versionId !== undefined) {
        throw new Error('Unexpected training request');
      }
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      return response();
    } }, { examples: 9, model: 'gpt-4o-mini', concurrency: 99 });
    expect(peak).toBe(3);
    expect(report.completed).toBe(9);
    expect(report.providerErrors).toBe(0);
  });

  it('stops scheduling after three provider errors, records failures and redacts configured keys', async () => {
    const report = await runTrainingTraffic({ chat: async () => { throw new Error('HTTP 401 token=secret-mubit secret-provider'); } }, {
      examples: 60, model: 'gpt-4o-mini', concurrency: 3, secrets: ['secret-mubit', 'secret-provider'],
    });
    expect(report).toMatchObject({ attempted: 3, completed: 0, providerErrors: 3, stoppedEarly: true, skipped: 57 });
    expect(report.records.every((r) => r.status === 'provider_error' && r.callId === null && r.parseOk === false)).toBe(true);
    expect(JSON.stringify(report)).not.toContain('secret-mubit');
    expect(JSON.stringify(report)).not.toContain('secret-provider');
    expect(report.records[0].error).toContain('[redacted]');
    expect(trainingTrafficSummary(report)).toMatch(/3 provider error/);
  });
});

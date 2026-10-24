import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repo, resetMemoryRepo } from '@/lib/db';
import { createRealClient, toVersionInfo } from '@/lib/mubit/client';
import { readConfig } from '@/lib/mubit/config';
import type { ModelVersionInfo, MubitClient } from '@/lib/mubit/types';
import { refreshStatus, startRefresh, versionEvalConfig } from '@/app/api/_lib/refresh';
import { POST as activate } from '@/app/api/versions/activate/route';
import { GET as metrics } from '@/app/api/metrics/route';
import { POST as evalRun } from '@/app/api/eval/run/route';

const post = (body: unknown) => new Request('http://local/api', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const remoteVersion = (versionId: string): ModelVersionInfo => ({ versionId, label: versionId, status: 'ready', createdAt: new Date().toISOString(), examples: 1 });
const globals = globalThis as typeof globalThis & { __mubit?: { mode: 'real' | 'mock'; client: MubitClient } };

function fakeRemote(versions: () => ModelVersionInfo[]): MubitClient {
  return {
    chat: async () => ({ text: '{"type":"done","reason":"complete"}', callId: 'test-call', usage: { in: 1, out: 1 }, latencyMs: 1 }),
    submitFeedback: async () => ({ feedbackId: 'feedback-1' }),
    listVersions: async () => versions(),
    requestRefresh: async () => ({ jobId: 'job-new', mode: 'explicit' }),
    refreshStatus: async () => versions().at(-1) ?? null,
  };
}

beforeEach(() => {
  resetMemoryRepo();
  vi.stubEnv('MUBIT_ENABLED', 'true');
  vi.stubEnv('MUBIT_BASE_URL', 'https://custom-middleware.test/v1');
  vi.stubEnv('MUBIT_FEEDBACK_URL', 'https://custom-middleware.test/feedback');
  globals.__mubit = { mode: 'real', client: fakeRemote(() => []) };
});
afterEach(() => { delete globals.__mubit; vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('promotion integrity', () => {
  it.each([
    { metrics: null, heldBackReason: null },
    { metrics: { gate: { pass: false } }, heldBackReason: 'regression on bug detection' },
  ])('refuses unevaluated or held-back candidates', async (candidate) => {
    await repo.versions.insert({ id: 'candidate', label: 'v2', baseModel: 'open-base', examples: 1, status: 'ready', rules: [], ...candidate });
    const res = await activate(post({ versionId: 'candidate' }));
    expect(res.status).toBe(409);
    expect((await repo.versions.current()).id).toBe('v1');
  });

  it('allows rollback to a previously gated version and to the original base', async () => {
    await repo.versions.insert({ id: 'approved', label: 'v2', baseModel: 'open-base', examples: 1, status: 'ready', rules: [], metrics: { gate: { pass: true } } });
    expect((await activate(post({ versionId: 'approved' }))).status).toBe(200);
    expect((await repo.versions.current()).id).toBe('approved');
    expect((await activate(post({ versionId: 'v1' }))).status).toBe(200);
    expect((await repo.versions.current()).id).toBe('v1');
  });

  it('refuses to transfer evaluation approval to a different remote adapter', async () => {
    await repo.versions.insert({ id: 'approved', label: 'v2', baseModel: 'open-base', mubitVersionId: 'evaluated', examples: 1, status: 'ready', rules: [], metrics: { gate: { pass: true } } });
    expect((await activate(post({ versionId: 'approved', mubitVersionId: 'unseen' }))).status).toBe(409);
    expect((await repo.versions.get('approved'))?.mubitVersionId).toBe('evaluated');
  });
});

describe('refresh integrity', () => {
  it('identifies the baseline by version identity, not a missing example count', async () => {
    const candidate = await repo.versions.insert({ id: 'candidate', label: 'v2', baseModel: 'open-base', examples: 0, mubitVersionId: 'adapter-2', status: 'ready', rules: [] });
    expect(versionEvalConfig(candidate)).toMatchObject({ lane: 'adapted', versionId: 'candidate' });
    expect(versionEvalConfig((await repo.versions.get('v1'))!)).toMatchObject({ lane: 'base', versionId: 'v1' });
  });

  it.each([undefined, 'queued', 'failed', 'trained'])('rejects a real refresh with no newly delivered corrections (%s)', async (status) => {
    if (status) await repo.corrections.insert({ source: 'human', goal: 'Buy one lamp', messages: [], goodAction: { type: 'done', reason: 'correct' }, status });
    let requests = 0;
    globals.__mubit = { mode: 'real', client: { ...fakeRemote(() => []), requestRefresh: async () => { requests++; return { jobId: 'unexpected-job', mode: 'explicit' }; } } };
    await expect(startRefresh()).rejects.toThrow(/correction|feedback/i);
    expect(requests).toBe(0);
    expect(await repo.versions.list()).toHaveLength(1);
  });

  it('reuses an existing real training job when its corrections are already assigned', async () => {
    await repo.versions.insert({ id: 'training-version', jobId: 'existing-job', label: 'v2', baseModel: 'open-base', examples: 1, status: 'training', rules: [] });
    expect(await startRefresh()).toEqual({ versionId: 'training-version', jobId: 'existing-job', mode: 'explicit' });
  });

  it('holds back a legacy zero-example real candidate before evaluating a base-model substitute', async () => {
    await repo.versions.insert({ id: 'empty-candidate', jobId: 'existing-job', label: 'v2', baseModel: 'open-base', examples: 0, status: 'training', rules: [] });
    expect((await refreshStatus('empty-candidate')).phase).toBe('held_back');
    expect((await repo.versions.current()).id).toBe('v1');
    expect(await repo.evals.list()).toHaveLength(0);
  });

  it('creates an adapted evaluation for a candidate even when its example count is missing', async () => {
    await repo.versions.insert({ id: 'candidate', label: 'v2', baseModel: 'open-base', examples: 0, mubitVersionId: 'adapter-2', status: 'ready', rules: [] });
    const response = await evalRun(post({ versionId: 'candidate' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(await repo.evals.get(body.data.evalId)).toMatchObject({ lane: 'adapted', versionId: 'candidate' });
  });

  it.each(['base', 'adapted'])('does not reuse a candidate evaluation with %s lane and incomplete held-out coverage', async (lane) => {
    await repo.versions.insert({ id: 'candidate', label: 'v2', baseModel: 'open-base', examples: 1, mubitVersionId: 'adapter-2', status: 'ready', rules: [] });
    await repo.evals.insert({ id: 'invalid-candidate-eval', versionId: 'candidate', lane, total: 48, done: 48,
      metrics: { final: true, runs: 4, healthyRuns: 3, bugRuns: 1, suite: 'smoke', verifiedSuccess: 1, bugRecall: 1, falseAlarms: 0,
        config: { lane, versionId: 'candidate', suite: 'heldout' } } });
    await refreshStatus('candidate');
    const evaluations = await repo.evals.list({ versionId: 'candidate' });
    expect(evaluations.some((e) => e.id !== 'invalid-candidate-eval' && e.lane === 'adapted')).toBe(true);
    expect((await repo.versions.current()).id).toBe('v1');
  });

  it('waits for a new remote version instead of adopting the existing ready version', async () => {
    await repo.corrections.insert({ source: 'human', goal: 'Buy one lamp', messages: [], goodAction: { type: 'done', reason: 'correct' }, status: 'sent' });
    let versions = [remoteVersion('already-ready')];
    globals.__mubit = { mode: 'real', client: fakeRemote(() => versions) };
    const job = await startRefresh();
    const waiting = await refreshStatus(job.versionId);
    expect(waiting.phase).toBe('training');
    expect(waiting.version?.mubitVersionId).toBeNull();
    versions = [...versions, remoteVersion('newly-trained')];
    expect((await refreshStatus(job.versionId)).phase).toBe('evaluating');
    expect((await repo.versions.get(job.versionId))?.mubitVersionId).toBe('newly-trained');
  });

  it('marks only delivered corrections as trained', async () => {
    const correction = { source: 'human', goal: 'Buy one lamp', messages: [], goodAction: { type: 'done' as const, reason: 'correct' }, createdAt: new Date(1) };
    await repo.corrections.insert({ id: 'delivered', ...correction, status: 'sent' });
    await repo.corrections.insert({ id: 'undelivered', ...correction, status: 'failed' });
    let versions: ModelVersionInfo[] = [];
    globals.__mubit = { mode: 'real', client: fakeRemote(() => versions) };
    const job = await startRefresh();
    versions = [remoteVersion('newly-trained')];
    await refreshStatus(job.versionId);
    expect(await repo.corrections.get('delivered')).toMatchObject({ status: 'trained', versionId: job.versionId });
    expect(await repo.corrections.get('undelivered')).toMatchObject({ status: 'failed', versionId: null });
    expect((await repo.versions.get(job.versionId))?.examples).toBe(1);
  });

  it('keeps corrections delivered after refresh started out of that version', async () => {
    await repo.corrections.insert({ source: 'human', goal: 'Buy one lamp', messages: [], goodAction: { type: 'done', reason: 'correct' }, status: 'sent' });
    await repo.corrections.insert({ id: 'late-delivery', source: 'human', goal: 'Buy one lamp', messages: [], goodAction: { type: 'done', reason: 'correct' }, status: 'queued', createdAt: new Date(1) });
    let versions: ModelVersionInfo[] = [];
    globals.__mubit = { mode: 'real', client: fakeRemote(() => versions) };
    const job = await startRefresh();
    await repo.corrections.update('late-delivery', { status: 'sent' });
    versions = [remoteVersion('newly-trained')];
    await refreshStatus(job.versionId);
    expect(await repo.corrections.get('late-delivery')).toMatchObject({ status: 'sent', versionId: null });
  });
});

describe('remote protocol integrity', () => {
  it.each(['pending', 'testing', 'collecting', 'unknown', undefined])('does not treat %s as a ready adapter', (status) => {
    expect(toVersionInfo({ version_id: 'version-1', status })?.status).toBe('training');
  });

  it('reports missing feedback configuration instead of claiming feedback was sent', async () => {
    const client = createRealClient(readConfig({ MUBIT_BASE_URL: 'https://custom.test/v1' }));
    await expect(client.submitFeedback({ input: [], preferredOutput: '{}', label: 'correction' })).rejects.toThrow(/MUBIT_FEEDBACK_URL/);
  });

  it('reports unavailable refresh tracking before creating an untrackable job', async () => {
    const client = createRealClient(readConfig({ MUBIT_BASE_URL: 'https://custom.test/v1' }));
    await expect(client.requestRefresh()).rejects.toThrow(/MUBIT_REFRESH_URL|MUBIT_VERSIONS_URL/);
  });

  it('does not replace a failed explicit job lookup with an unrelated ready adapter', async () => {
    vi.stubGlobal('fetch', async (url: string) => url.endsWith('/versions')
      ? new Response(JSON.stringify({ versions: [remoteVersion('unrelated-ready')] }))
      : new Response('{}', { status: 404 }));
    const client = createRealClient(readConfig({ MUBIT_BASE_URL: 'https://custom.test/v1', MUBIT_REFRESH_URL: 'https://custom.test/refresh', MUBIT_VERSIONS_URL: 'https://custom.test/versions' }));
    await expect(client.refreshStatus('unknown-job')).rejects.toThrow(/HTTP 404/);
  });

  it('refuses to send provider credentials beside a Mubit key to the official API', () => {
    expect(() => createRealClient(readConfig({ MUBIT_BASE_URL: 'https://api.mubit.ai/openai/v1', MUBIT_API_KEY: 'mbt_test', MUBIT_PROVIDER_KEY_HEADER: 'x-provider-key', OPENAI_API_KEY: 'provider-test' }))).toThrow(/provider/i);
  });

  it('does not silently run the provider model when an official adapter version is requested', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 400 }));
    const client = createRealClient(readConfig({ MUBIT_BASE_URL: 'https://api.mubit.ai/openai/v1', MUBIT_API_KEY: 'mbt_test', MUBIT_VERSION_MODE: 'console_pin' }));
    await expect(client.chat({ model: 'open:base', versionId: 'adapter-1', messages: [] })).rejects.toThrow(/adapter.*API|API.*adapter/i);
  });

  it.each(['console_pin', 'header'])('rejects a custom %s mode that cannot transmit the requested version identity', async (versionMode) => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 400 }));
    const client = createRealClient(readConfig({ MUBIT_BASE_URL: 'https://custom.test/v1', MUBIT_VERSION_MODE: versionMode }));
    await expect(client.chat({ model: 'open:base', versionId: 'adapter-1', messages: [] })).rejects.toThrow(/version.*(header|pin|identity)|header.*version/i);
  });
});

it('continues advancing a pending baseline after another baseline has completed', async () => {
  await repo.evals.insert({ id: 'closed-eval', lane: 'closed', versionId: null, total: 48, done: 48, metrics: { final: true, config: { lane: 'closed', versionId: null, suite: 'heldout' } } });
  await repo.evals.insert({ id: 'base-eval', lane: 'base', versionId: 'v1', total: 48, done: 40, metrics: { config: { lane: 'base', versionId: 'v1', suite: 'heldout' } } });
  expect((await metrics(new Request('http://local/api/metrics?scope=heldout'))).status).toBe(200);
  expect((await repo.evals.get('base-eval'))?.done).toBe(48);
});

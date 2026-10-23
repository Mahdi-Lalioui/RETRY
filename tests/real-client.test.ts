// Real client against a local fake OpenAI-compatible server (sandbox has no network to Mubit).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRealClient, resolveModel, toFeedbackPayload } from '@/lib/mubit/client';
import { readConfig } from '@/lib/mubit/config';
import { toStepOutcomePayload } from '@/lib/mubit/memory-fallback';

const seen: { url: string; headers: http.IncomingHttpHeaders; body: Record<string, unknown> }[] = [];
let server: http.Server; let base = '';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      seen.push({ url: req.url ?? '', headers: req.headers, body: data ? JSON.parse(data) : {} });
      res.setHeader('content-type', 'application/json');
      if (req.url?.endsWith('/chat/completions')) {
        res.setHeader('x-request-id', 'req_123');
        res.end(JSON.stringify({ id: 'cmpl_1', object: 'chat.completion', created: 1, model: 'm', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"type":"done","reason":"ok"}' } }], usage: { prompt_tokens: 100, completion_tokens: 9, total_tokens: 109 } }));
      } else if (req.url === '/feedback') res.end(JSON.stringify({ feedback_id: 'fb_9' }));
      else if (req.url === '/versions') res.end(JSON.stringify({ versions: [{ version_id: 'mv2', status: 'training', progress: 0.4 }] }));
      else { res.statusCode = 404; res.end('{}'); }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });

describe('real Mubit client', () => {
  it('routes chat with version suffix, auth, provider header, request id', async () => {
    const c = readConfig({ MUBIT_ENABLED: 'true', MUBIT_BASE_URL: `${base}/v1`, MUBIT_API_KEY: 'k_test', MUBIT_PROVIDER_KEY_HEADER: 'x-provider-key', OPENAI_API_KEY: 'sk_test', MUBIT_FEEDBACK_URL: `${base}/feedback`, MUBIT_VERSIONS_URL: `${base}/versions` });
    const m = createRealClient(c);
    const r = await m.chat({ model: 'open:llama', versionId: 'mv2', messages: [{ role: 'user', content: 'hi' }], jsonMode: true, seed: 7 });
    expect(r).toMatchObject({ text: '{"type":"done","reason":"ok"}', callId: 'req_123', usage: { in: 100, out: 9 } });
    const req = seen.find((s) => s.url.endsWith('/chat/completions'))!;
    expect(req.body).toMatchObject({ model: 'llama@mv2', temperature: 0, seed: 7, response_format: { type: 'json_object' } });
    expect(req.headers.authorization).toBe('Bearer k_test');
    expect(req.headers['x-provider-key']).toBe('sk_test');
    expect((await m.submitFeedback({ callId: 'req_123', input: [], preferredOutput: '{}', label: 'correction' })).feedbackId).toBe('fb_9');
    expect(seen.find((s) => s.url === '/feedback')!.body).toMatchObject({ request_id: 'req_123', preferred_output: '{}', label: 'correction' });
    expect(await m.listVersions()).toEqual([expect.objectContaining({ versionId: 'mv2', status: 'training', progress: 0.4 })]);
    expect(await m.requestRefresh()).toEqual({ jobId: null, mode: 'automatic' });
  });

  it('header version mode + payload adapters', () => {
    const c = readConfig({ MUBIT_VERSION_MODE: 'header', MUBIT_VERSION_HEADER: 'x-v' });
    expect(resolveModel(c, 'closed:gpt-4o-mini', 'v3')).toBe('gpt-4o-mini');
    expect(toFeedbackPayload({ input: [], preferredOutput: 'x', label: 'accepted' })).toMatchObject({ accepted: true, score: 1 });
    expect(toStepOutcomePayload({ runId: 'r', stepId: 's', outcome: 'failure', signal: -2, directiveHint: 'h', metadata: { a: 1 } }))
      .toEqual({ run_id: 'r', step_id: 's', outcome: 'failure', signal: -1, rationale: '', directive_hint: 'h', metadata_json: '{"a":1}' });
  });
});

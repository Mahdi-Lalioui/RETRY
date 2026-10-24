// npm run smoke:mubit — latency for chat / feedback / versions against the active client (real or mock).
// --inference-only --lane closed verifies routed inference without undocumented training endpoints.
// Never prints credentials. --require-real rejects mock mode.
import './env';
import { getMubit, mubitMode } from '../lib/mubit';
import { cfg } from '../lib/mubit/config';
import { buildMessages } from '../lib/agent/prompt';
import { LANES } from '../lib/agent/lanes';
import { parseAction } from '../lib/agent/parse';
import { snapshotIds } from '../lib/agent/prompt';

const SNAP = `PAGE home | LAYOUT layout-v1 | CART 1 items £48.00
[modal:upsell] e1 heading "Protect your purchase?" | e2 button "Add Protection Plan (£6)" | e3 button "No thanks"
[header] e4 button "Cart (1)"`;

async function timed<T>(name: string, fn: () => Promise<T>): Promise<{ ok: boolean; value?: T }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    console.log(`  ${name.padEnd(10)} ${String(Date.now() - t0).padStart(5)}ms  ok  ${JSON.stringify(value).slice(0, 160)}`);
    return { ok: true, value };
  } catch (e) {
    console.log(`  ${name.padEnd(10)} ${String(Date.now() - t0).padStart(5)}ms  FAIL ${(e as Error).message}`);
    return { ok: false };
  }
}

async function main() {
  const c = cfg();
  const mode = mubitMode();
  if (c.enabled && !c.baseUrl) throw new Error('MUBIT_ENABLED=true requires MUBIT_BASE_URL; refusing a misleading mock smoke test.');
  if (process.argv.includes('--require-real') && mode !== 'real') throw new Error('Real Mubit was requested, but mock mode is configured.');
  const laneArg = process.argv.indexOf('--lane');
  const selected = laneArg >= 0 ? process.argv[laneArg + 1] : undefined;
  if (selected !== undefined && selected !== 'closed' && selected !== 'base') throw new Error('--lane must be closed or base');
  const lanes: ('closed' | 'base')[] = selected ? [selected] : ['closed', 'base'];
  if (mode === 'real' && lanes.includes('base') && c.openBaseModel === 'open-base') {
    throw new Error('OPEN_BASE_MODEL is not configured. Use --lane closed to verify the baseline, or configure a served open model.');
  }
  console.log(`[smoke] mode=${mode.toUpperCase()} base=${c.baseUrl ? 'set' : 'unset'} key=${c.apiKey ? 'set' : 'unset'} feedback=${c.feedbackUrl ? 'set' : 'unset'} versions=${c.versionsUrl ? 'set' : 'unset'} versionMode=${c.versionMode}`);
  const m = getMubit();
  const messages = buildMessages({ goal: 'Buy one Aurora Lamp and reach order confirmation.', history: [], snapshot: SNAP, lane: 'base' });
  const results = [];
  for (const lane of lanes) {
    const ref = LANES[lane].modelRef();
    results.push(await timed(`chat:${lane}`, async () => {
      const res = await m.chat({ model: ref.model, messages, temperature: 0, seed: 7, jsonMode: true, metadata: { task: 'retry-next-action', lane, runId: 'smoke', stepIdx: '0' } });
      const parsed = parseAction(res.text, snapshotIds(SNAP));
      if (!parsed.action) throw new Error(`Invalid model action: ${parsed.error}`);
      return { callId: res.callId, latencyMs: res.latencyMs, usage: res.usage, action: parsed.action };
    }));
  }
  if (!process.argv.includes('--inference-only')) {
    const callId = results.at(-1)?.value?.callId ?? null;
    results.push(await timed('feedback', () => m.submitFeedback({ callId, input: messages, preferredOutput: JSON.stringify({ type: 'click', target: 'e3', reason: 'smoke test' }), label: 'correction', score: 0, tags: ['smoke'] })));
    results.push(await timed('versions', () => m.listVersions()));
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`[smoke] ${failed ? `${failed} call(s) failed` : 'all calls ok'}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e: unknown) => {
  // Provider errors can contain credentials. Redact configured keys before writing diagnostics.
  let message = e instanceof Error ? e.message : String(e);
  for (const key of [cfg().apiKey, cfg().openaiApiKey]) if (key) message = message.replaceAll(key, '[redacted]');
  console.error(`[smoke] ${message}`);
  process.exitCode = 1;
});

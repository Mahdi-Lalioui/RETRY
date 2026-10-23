// npm run smoke:mubit — latency for chat / feedback / versions against the active client (real or mock).
// Never prints secrets. Exits 0 in mock mode; non-zero if a real call fails.
import { getMubit, mubitMode } from '../lib/mubit';
import { cfg } from '../lib/mubit/config';
import { buildMessages } from '../lib/agent/prompt';
import { LANES } from '../lib/agent/lanes';

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
  console.log(`[smoke] mode=${mode.toUpperCase()} base=${c.baseUrl ? 'set' : 'unset'} key=${c.apiKey ? 'set' : 'unset'} feedback=${c.feedbackUrl ? 'set' : 'unset'} versions=${c.versionsUrl ? 'set' : 'unset'} versionMode=${c.versionMode}`);
  const m = getMubit();
  const messages = buildMessages({ goal: 'Buy one Aurora Lamp and reach order confirmation.', history: [], snapshot: SNAP, lane: 'base' });
  const results = [];
  for (const lane of ['closed', 'base'] as const) {
    const ref = LANES[lane].modelRef();
    results.push(await timed(`chat:${lane}`, () => m.chat({ model: ref.model, messages, temperature: 0, seed: 7, jsonMode: true, metadata: { task: 'retry-next-action', lane, runId: 'smoke', stepIdx: '0' } })));
  }
  const callId = (results[1].value as { callId?: string | null } | undefined)?.callId ?? null;
  results.push(await timed('feedback', () => m.submitFeedback({ callId, input: messages, preferredOutput: JSON.stringify({ type: 'click', target: 'e3', reason: 'smoke test' }), label: 'correction', score: 0, tags: ['smoke'] })));
  results.push(await timed('versions', () => m.listVersions()));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`[smoke] ${failed ? `${failed} call(s) failed` : 'all calls ok'}`);
  process.exit(mode === 'mock' ? 0 : failed ? 1 : 0);
}

main();

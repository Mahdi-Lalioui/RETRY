// plan §11.4 — optional signal channel to the Mubit control plane (memory SDK HTTP routes, discovered in
// @mubit-ai/sdk@0.13.2: POST /v2/control/step_outcome and /v2/control/outcome, Authorization: Bearer).
// Plain fetch (no gRPC SDK in serverless). Enabled only with MUBIT_MEMORY_FALLBACK=true. Never throws.
import { cfg } from './config';

export interface StepOutcome {
  runId: string; stepId: string; stepName?: string;
  outcome: 'success' | 'failure' | 'partial' | 'neutral';
  signal: number;                 // [-1, 1]
  rationale?: string; directiveHint?: string;
  metadata?: Record<string, unknown>;
}

async function post(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number }> {
  const c = cfg();
  if (!c.memoryFallback || !c.apiKey) return { ok: false, status: 0 };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), c.otherTimeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(`${c.endpoint}${path}`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify(body),
    });
    console.log(`[mubit] memory ${path} ${res.status} ${Date.now() - t0}ms`);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.warn(`[mubit] memory ${path} failed: ${(e as Error).message}`);
    return { ok: false, status: 0 };
  } finally { clearTimeout(timer); }
}

const compact = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export function toStepOutcomePayload(s: StepOutcome): Record<string, unknown> {
  return compact({
    run_id: s.runId, step_id: s.stepId, step_name: s.stepName, outcome: s.outcome,
    signal: Math.max(-1, Math.min(1, s.signal)), rationale: s.rationale ?? '', directive_hint: s.directiveHint,
    metadata_json: s.metadata ? JSON.stringify(s.metadata) : undefined,
  });
}

export function recordStepOutcome(s: StepOutcome) {
  return post('/v2/control/step_outcome', toStepOutcomePayload(s));
}

export function recordRunOutcome(o: { runId: string; referenceId: string; outcome: string; signal: number; rationale?: string }) {
  return post('/v2/control/outcome', compact({
    run_id: o.runId, reference_id: o.referenceId, outcome: o.outcome, signal: o.signal, rationale: o.rationale ?? '',
    idempotency_key: `${o.runId}:${o.referenceId}`,
  }));
}

export function memoryFallbackEnabled(): boolean { return cfg().memoryFallback; }

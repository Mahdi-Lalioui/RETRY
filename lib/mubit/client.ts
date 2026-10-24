// plan §11.2 — the ONLY file that imports `openai`. Every LLM call goes through Mubit Middleware.
import OpenAI from 'openai';
import type { ChatReq, ChatRes, FeedbackReq, ModelVersionInfo, MubitClient } from './types';
import { cfg, type MubitConfig } from './config';

/** "closed:gpt-4o-mini" → "gpt-4o-mini"; "open:llama" → "llama". */
export function stripLane(model: string): string { return model.replace(/^(closed|open):/, ''); }

/** VERSION_MODE=model_suffix → `${model}@${versionId}` (TODO(MUBIT) exact syntax via MUBIT_VERSION_SUFFIX_SEP). */
export function resolveModel(c: MubitConfig, model: string, versionId?: string): string {
  const m = stripLane(model);
  if (versionId && c.versionMode === 'model_suffix') return `${m}${c.versionSuffixSep}${versionId}`;
  return m;
}
export function versionHeaders(c: MubitConfig, versionId?: string): Record<string, string> {
  if (versionId && c.versionMode === 'header' && c.versionHeader) return { [c.versionHeader]: versionId };
  return {};
}

/** The ONE place to edit once Mubit confirms the feedback payload shape. TODO(MUBIT) */
export function toFeedbackPayload(f: FeedbackReq): Record<string, unknown> {
  return {
    request_id: f.callId ?? undefined,
    input: f.input,                         // full messages so examples are self-contained
    preferred_output: f.preferredOutput,    // good action JSON
    bad_output: f.badOutput,
    label: f.label,
    accepted: f.label === 'accepted',
    score: f.score ?? (f.label === 'correction' ? 0 : f.label === 'accepted' ? 1 : -1),
    tags: f.tags ?? [],
    task: 'retry-next-action',
  };
}

/** Map an unknown versions/status payload into ModelVersionInfo. TODO(MUBIT) */
export function toVersionInfo(x: unknown): ModelVersionInfo | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const id = (o.versionId ?? o.version_id ?? o.id ?? o.version) as string | undefined;
  if (!id) return null;
  const st = String(o.status ?? '').toLowerCase().trim();
  return {
    versionId: String(id), label: String(o.label ?? o.name ?? id),
    createdAt: String(o.createdAt ?? o.created_at ?? new Date().toISOString()),
    examples: typeof o.examples === 'number' ? o.examples : typeof o.num_examples === 'number' ? o.num_examples : undefined,
    // Only an explicit success can make an adapter eligible for evaluation.
    status: /fail|error|cancel|reject|below.target/.test(st) ? 'failed'
      : /^(ready|completed?|succeeded|success|passed|available)$/.test(st) ? 'ready' : 'training',
    progress: typeof o.progress === 'number' ? o.progress : undefined,
  };
}

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fn(ctrl.signal); } finally { clearTimeout(t); }
}

async function fetchJson(c: MubitConfig, url: string, init: { method: string; body?: unknown }, retries = 0): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await withTimeout(c.otherTimeoutMs, async (signal) => {
        const res = await fetch(url, {
          method: init.method, signal,
          headers: { 'content-type': 'application/json', ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
      });
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
    }
  }
  throw lastErr;
}

export function createRealClient(c: MubitConfig = cfg()): MubitClient {
  if (!c.baseUrl) throw new Error('[mubit] MUBIT_BASE_URL is required for the real client');
  const officialApi = new URL(c.baseUrl).hostname === 'api.mubit.ai';
  if (officialApi && c.providerKeyHeader && c.openaiApiKey) {
    throw new Error('[mubit] Add provider credentials in the Mubit console; the API accepts only the Mubit key.');
  }
  const defaultHeaders: Record<string, string> = {};
  if (c.providerKeyHeader && c.openaiApiKey) defaultHeaders[c.providerKeyHeader] = c.openaiApiKey;
  const oai = new OpenAI({ baseURL: c.baseUrl, apiKey: c.apiKey ?? 'missing', defaultHeaders, timeout: c.chatTimeoutMs, maxRetries: 1 });

  return {
    async chat(req: ChatReq): Promise<ChatRes> {
      if (officialApi && req.versionId) {
        throw new Error('[mubit] The public API does not support adapter inference. Compare adapter versions in the Mubit console; configure a confirmed adapter API to run them here.');
      }
      if (req.versionId && c.versionMode === 'console_pin') {
        throw new Error('[mubit] A console pin cannot transmit a version identity. Configure a confirmed version model suffix or header before evaluating an adapter.');
      }
      if (req.versionId && c.versionMode === 'header' && !c.versionHeader) {
        throw new Error('[mubit] MUBIT_VERSION_HEADER is required to transmit the requested version identity.');
      }
      const model = resolveModel(c, req.model, req.versionId);
      const headers = versionHeaders(c, req.versionId);
      const t0 = performance.now();
      const { data, response } = await oai.chat.completions.create({
        model, messages: req.messages, temperature: req.temperature ?? 0, seed: req.seed,
        response_format: req.jsonMode && c.supportsJsonMode ? { type: 'json_object' } : undefined,
        metadata: c.supportsMetadata ? req.metadata : undefined,
      }, { headers }).withResponse();
      const latencyMs = Math.round(performance.now() - t0);
      const usage = { in: data.usage?.prompt_tokens ?? 0, out: data.usage?.completion_tokens ?? 0 };
      console.log(`[mubit] chat lane=${req.metadata?.lane ?? '-'} model=${model} ${latencyMs}ms ${usage.in}/${usage.out} tok`);
      return {
        text: data.choices[0]?.message?.content ?? '',
        callId: response.headers.get(c.requestIdHeader) ?? data.id ?? null,
        usage, latencyMs,
      };
    },

    async submitFeedback(f: FeedbackReq) {
      if (!c.feedbackUrl) throw new Error('[mubit] MUBIT_FEEDBACK_URL is not configured. The public API does not document correction submission; feedback has not been sent.');
      const t0 = Date.now();
      const r = (await fetchJson(c, c.feedbackUrl, { method: 'POST', body: toFeedbackPayload(f) }, 2)) as Record<string, unknown>;
      const id = (r.feedbackId ?? r.feedback_id ?? r.id ?? null) as string | null;
      console.log(`[mubit] feedback ${f.label} ${Date.now() - t0}ms id=${id ?? '-'}`);
      return { feedbackId: id };
    },

    async requestRefresh() {
      if (!c.refreshUrl && !c.versionsUrl) throw new Error('[mubit] Configure a confirmed MUBIT_REFRESH_URL or MUBIT_VERSIONS_URL to track model updates. Public adapter training is managed in the Mubit console.');
      if (!c.refreshUrl) return { jobId: null, mode: 'automatic' as const };
      const r = (await fetchJson(c, c.refreshUrl, { method: 'POST', body: {} })) as Record<string, unknown>;
      const jobId = (r.jobId ?? r.job_id ?? r.id ?? null) as string | null;
      console.log(`[mubit] refresh requested job=${jobId ?? '-'}`);
      return { jobId, mode: 'explicit' as const };
    },

    async refreshStatus(jobId: string | null) {
      if (c.refreshUrl && jobId) {
        const r = await fetchJson(c, `${c.refreshUrl.replace(/\/+$/, '')}/${encodeURIComponent(jobId)}`, { method: 'GET' });
        // An explicit job lookup must never fall back to an unrelated version.
        return toVersionInfo(r);
      }
      const vs = await this.listVersions();
      return vs.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).at(-1) ?? null;
    },

    async listVersions() {
      if (!c.versionsUrl) return []; // versions tracked in our DB (lib/db) — see /api/versions
      const r = await fetchJson(c, c.versionsUrl, { method: 'GET' });
      const arr = Array.isArray(r) ? r : ((r as Record<string, unknown>).versions ?? (r as Record<string, unknown>).data ?? []) as unknown[];
      return (arr as unknown[]).map(toVersionInfo).filter((v): v is ModelVersionInfo => !!v);
    },
  };
}

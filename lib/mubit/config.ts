// plan §11.1 / §18 — every unknown Mubit detail is an env-driven TODO(MUBIT).
export type VersionMode = 'model_suffix' | 'header' | 'console_pin';

const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const num = (v: string | undefined, d: number) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const str = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export interface MubitConfig {
  enabled: boolean;
  baseUrl?: string;               // TODO(MUBIT) OpenAI-compatible Middleware base URL
  apiKey?: string;
  providerKeyHeader?: string;     // TODO(MUBIT) passthrough header for OpenAI key
  openaiApiKey?: string;
  requestIdHeader: string;        // TODO(MUBIT)
  feedbackUrl?: string;           // TODO(MUBIT)
  refreshUrl?: string;            // TODO(MUBIT)
  versionsUrl?: string;           // TODO(MUBIT)
  versionMode: VersionMode;
  versionHeader?: string;
  versionSuffixSep: string;       // TODO(MUBIT) exact suffix syntax, default "@"
  supportsJsonMode: boolean;
  supportsMetadata: boolean;
  memoryFallback: boolean;
  endpoint: string;               // memory/control plane (fallback only)
  chatTimeoutMs: number;
  otherTimeoutMs: number;
  openBaseModel: string;
  closedModel: string;
  demoMode: boolean;
  mockLatencyScale: number;
  mockTrainSeconds: number;
  maxSteps: number;
  refreshMinExamples: number;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): MubitConfig {
  const vm = (env.MUBIT_VERSION_MODE ?? 'model_suffix') as VersionMode;
  return {
    enabled: bool(env.MUBIT_ENABLED, false),
    baseUrl: str(env.MUBIT_BASE_URL),
    apiKey: str(env.MUBIT_API_KEY),
    providerKeyHeader: str(env.MUBIT_PROVIDER_KEY_HEADER),
    openaiApiKey: str(env.OPENAI_API_KEY),
    requestIdHeader: str(env.MUBIT_REQUEST_ID_HEADER) ?? 'x-request-id',
    feedbackUrl: str(env.MUBIT_FEEDBACK_URL),
    refreshUrl: str(env.MUBIT_REFRESH_URL),
    versionsUrl: str(env.MUBIT_VERSIONS_URL),
    versionMode: ['model_suffix', 'header', 'console_pin'].includes(vm) ? vm : 'model_suffix',
    versionHeader: str(env.MUBIT_VERSION_HEADER),
    versionSuffixSep: str(env.MUBIT_VERSION_SUFFIX_SEP) ?? '@',
    supportsJsonMode: bool(env.MUBIT_SUPPORTS_JSON_MODE, true),
    supportsMetadata: bool(env.MUBIT_SUPPORTS_METADATA, false),
    memoryFallback: bool(env.MUBIT_MEMORY_FALLBACK, false),
    endpoint: (str(env.MUBIT_ENDPOINT) ?? 'https://api.mubit.ai').replace(/\/+$/, ''),
    chatTimeoutMs: num(env.MUBIT_CHAT_TIMEOUT_MS, 20_000),
    otherTimeoutMs: num(env.MUBIT_OTHER_TIMEOUT_MS, 10_000),
    openBaseModel: str(env.OPEN_BASE_MODEL) ?? 'open-base',
    closedModel: str(env.CLOSED_MODEL) ?? 'gpt-4o-mini',
    demoMode: bool(env.DEMO_MODE, false),
    mockLatencyScale: num(env.MOCK_LATENCY_SCALE, 1),
    mockTrainSeconds: num(env.MOCK_TRAIN_SECONDS, 12),
    maxSteps: num(env.MAX_STEPS, 16),
    refreshMinExamples: num(env.REFRESH_MIN_EXAMPLES, 40),
  };
}

let warned = false;
/** Fresh read each call (cheap) so tests can change env. Warns once if misconfigured. */
export function cfg(): MubitConfig {
  const c = readConfig();
  if (c.enabled && !c.baseUrl && !c.demoMode && !warned) {
    warned = true;
    console.warn('[mubit] MUBIT_ENABLED=true but MUBIT_BASE_URL is missing — falling back to MOCK client.');
  }
  return c;
}

// CONTRACT (plan.md §5.3) — frozen.
export interface Msg { role: 'system' | 'user' | 'assistant'; content: string }

export interface ChatReq {
  model: string; versionId?: string; messages: Msg[];
  temperature?: number; seed?: number; jsonMode?: boolean;
  metadata?: Record<string, string>; // task:'retry-next-action', lane, runId, stepIdx
}
export interface ChatRes { text: string; callId: string | null; usage: { in: number; out: number }; latencyMs: number }

export interface FeedbackReq {
  callId?: string | null; input: Msg[]; preferredOutput: string; badOutput?: string;
  label: 'correction' | 'accepted' | 'rejected'; score?: number; tags?: string[];
}
export interface ModelVersionInfo {
  versionId: string; label: string; createdAt: string; examples?: number;
  status: 'training' | 'ready' | 'failed'; progress?: number;
}
export interface MubitClient {
  chat(req: ChatReq): Promise<ChatRes>;
  submitFeedback(f: FeedbackReq): Promise<{ feedbackId: string | null }>;
  requestRefresh(): Promise<{ jobId: string | null; mode: 'explicit' | 'automatic' }>;
  refreshStatus(jobId: string | null): Promise<ModelVersionInfo | null>;
  listVersions(): Promise<ModelVersionInfo[]>;
}

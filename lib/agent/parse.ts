// plan §9.3 — extract first JSON object, zod-validate, check target ids.
import { z } from 'zod';
import type { AgentAction } from './types';

export const ActionSchema = z.object({
  type: z.enum(['click', 'type', 'select', 'scroll', 'done', 'report_bug']),
  target: z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v === null || v === undefined || v === '' ? undefined : String(v))),
  value: z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v === null || v === undefined ? undefined : String(v))),
  reason: z.string().optional().default(''),
});

/** Find the first balanced {...} object in text (handles code fences and prose around it). */
export function extractJson(raw: string): string | null {
  const text = raw.replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

export const NEEDS_TARGET = new Set(['click', 'type', 'select']);

export function parseAction(raw: string, validIds: string[]): { action: AgentAction | null; error?: string; badTarget?: string } {
  const json = extractJson(raw);
  if (!json) return { action: null, error: 'no JSON object found' };
  let obj: unknown;
  try { obj = JSON.parse(json); } catch { return { action: null, error: 'invalid JSON' }; }
  const r = ActionSchema.safeParse(obj);
  if (!r.success) return { action: null, error: `schema: ${r.error.issues.map((i) => i.message).join('; ')}` };
  const d = r.data;
  let target = d.target;
  if (target && /^\d+$/.test(target)) target = `e${target}`;
  const action: AgentAction = { type: d.type, reason: d.reason || '' };
  if (target !== undefined) action.target = target;
  if (d.value !== undefined && (d.type === 'type' || d.type === 'select')) action.value = d.value;
  if (NEEDS_TARGET.has(d.type)) {
    if (!target) return { action: null, error: 'missing target', badTarget: '' };
    if (!validIds.includes(target)) return { action: null, error: `target "${target}" not in snapshot`, badTarget: target };
  }
  return { action };
}

export function retryMessage(badTarget: string | undefined): string {
  return `Your target "${badTarget ?? ''}" is not in the snapshot. Choose a valid id.`;
}

export const INVALID_FALLBACK: AgentAction = { type: 'scroll', reason: 'invalid output' };

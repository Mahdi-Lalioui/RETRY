// plan §9.2 — identical across lanes except the ICL lane, which appends stored corrections.
import type { HistoryItem, LaneId, AgentAction } from './types';
import type { Msg } from '@/lib/mubit/types';

export const SYSTEM_PROMPT = `You are RETRY, a QA test agent executing an end-to-end test on a web shop.
Each turn you receive the test goal, your recent actions with results, and a snapshot of the current page.
Return ONLY a JSON object: {"type": "...", "target": "...", "value": "...", "reason": "..."}
- type: one of click | type | select | scroll | done | report_bug
- target: an element id from the snapshot (e.g. "e7"). Required for click/type/select.
- value: text to type or option to select. Only for type/select.
- reason: one short sentence.
Use "done" only when the goal is verifiably complete (an order confirmation with an order number is visible).
Use "report_bug" when the site prevents completing the goal or shows invalid data; put the evidence in reason.
Follow house test policy.`;

export const ICL_HEADER = 'HOUSE TEST POLICY EXAMPLES (learned from past human corrections):';
export const HISTORY_WINDOW = 6;

export function formatAction(a: AgentAction): string {
  const t = a.target ? ` ${a.target}` : '';
  const v = a.value !== undefined && a.value !== '' ? ` "${a.value}"` : '';
  return `${a.type}${t}${v}`;
}

export function formatHistory(history: HistoryItem[]): string {
  const recent = history.slice(-HISTORY_WINDOW);
  const offset = history.length - recent.length;
  if (!recent.length) return '(none)';
  return recent.map((h, i) => `${offset + i + 1}. ${formatAction(h.action)} → ${h.result}`).join('\n');
}

export function buildUserMessage(goal: string, history: HistoryItem[], snapshot: string): string {
  return `GOAL: ${goal}\nHISTORY (most recent last):\n${formatHistory(history)}\nPAGE SNAPSHOT:\n${snapshot}\nNext action JSON:`;
}

export function buildMessages(p: { goal: string; history: HistoryItem[]; snapshot: string; lane: LaneId; iclExamples?: string[] }): Msg[] {
  let system = SYSTEM_PROMPT;
  if (p.lane === 'icl' && p.iclExamples && p.iclExamples.length) {
    system += `\n\n${ICL_HEADER}\n${p.iclExamples.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;
  }
  return [
    { role: 'system', content: system },
    { role: 'user', content: buildUserMessage(p.goal, p.history, p.snapshot) },
  ];
}

export function promptChars(messages: Msg[]): number {
  return messages.reduce((n, m) => n + m.content.length, 0);
}

/** One ICL example line: "[R1] situation excerpt → correct action". */
export function formatIclExample(c: { rule?: string | null; messages: Msg[]; goodAction: AgentAction; snapshotLabel?: string }): string {
  const user = c.messages.find((m) => m.role === 'user')?.content ?? '';
  const snap = user.split('PAGE SNAPSHOT:\n')[1]?.split('\nNext action JSON:')[0] ?? '';
  const lines = snap.split('\n');
  const head = lines[0] ?? '';
  const target = c.goodAction.target;
  const focus = target ? lines.find((l) => new RegExp(`\\b${target} `).test(l)) : lines[1];
  const label = target && focus ? focus.match(new RegExp(`\\b${target} \\w+ "([^"]*)"`))?.[1] : undefined;
  const excerpt = `${head}${focus ? ` / ${focus.slice(0, 220)}` : ''}`;
  const act = `${formatAction(c.goodAction)}${label ? ` ("${label}")` : ''} — ${c.goodAction.reason}`;
  return `${c.rule ? `[${c.rule}] ` : ''}${excerpt} → ${act}`;
}

export function snapshotIds(snapshot: string): string[] {
  const ids = new Set<string>();
  for (const m of snapshot.matchAll(/(?:^|\] |\| )(e\d+) /gm)) ids.add(m[1]);
  return [...ids];
}

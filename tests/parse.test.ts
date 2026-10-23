import { describe, it, expect } from 'vitest';
import { parseAction, extractJson } from '@/lib/agent/parse';
import { buildMessages, snapshotIds, formatHistory, SYSTEM_PROMPT, ICL_HEADER } from '@/lib/agent/prompt';
import { detectStuck, stuckReason } from '@/lib/agent/stuck';
import type { HistoryItem } from '@/lib/agent/types';

const SNAP = `PAGE checkout | LAYOUT layout-v7 | CART 2 items £28.00
[modal:upsell] e1 heading "Protect your purchase?" | e2 button "Protect it — £6" | e3 button "Not now"
[checkout:coupon] e7 textbox "Coupon code" value="" | e8 button "Apply"`;
const IDS = snapshotIds(SNAP);

describe('snapshotIds', () => {
  it('extracts ids in order', () => expect(IDS).toEqual(['e1', 'e2', 'e3', 'e7', 'e8']));
});

describe('parseAction', () => {
  it('parses plain JSON', () => {
    expect(parseAction('{"type":"click","target":"e3","reason":"decline"}', IDS).action).toEqual({ type: 'click', target: 'e3', reason: 'decline' });
  });
  it('handles code fences and prose', () => {
    const r = parseAction('Sure!\n```json\n{"type": "type", "target": "e7", "value": "NIGHTSHIFT", "reason": "coupon {x}"}\n```', IDS);
    expect(r.action).toEqual({ type: 'type', target: 'e7', value: 'NIGHTSHIFT', reason: 'coupon {x}' });
  });
  it('rejects invalid ids', () => {
    const r = parseAction('{"type":"click","target":"e99","reason":"x"}', IDS);
    expect(r.action).toBeNull(); expect(r.badTarget).toBe('e99');
  });
  it('rejects missing target for click', () => {
    expect(parseAction('{"type":"click","reason":"x"}', IDS).action).toBeNull();
  });
  it('accepts done without target and numeric ids', () => {
    expect(parseAction('{"type":"done","reason":"ok"}', IDS).action?.type).toBe('done');
    expect(parseAction('{"type":"click","target":3,"reason":"x"}', IDS).action?.target).toBe('e3');
  });
  it('rejects bad type / no json', () => {
    expect(parseAction('{"type":"hover","target":"e1"}', IDS).action).toBeNull();
    expect(parseAction('nothing here', IDS).action).toBeNull();
    expect(extractJson('a {"b": {"c": 1}} d')).toBe('{"b": {"c": 1}}');
  });
});

describe('prompt', () => {
  it('builds §9.2 messages', () => {
    const h: HistoryItem[] = [{ action: { type: 'click', target: 'e3', reason: '' }, result: 'ok' }, { action: { type: 'type', target: 'e7', value: 'SAVE10', reason: '' }, result: 'ok' }];
    const m = buildMessages({ goal: 'Buy X', history: h, snapshot: SNAP, lane: 'base' });
    expect(m[0].content).toBe(SYSTEM_PROMPT);
    expect(m[1].content).toContain('GOAL: Buy X\nHISTORY (most recent last):\n1. click e3 → ok\n2. type e7 "SAVE10" → ok\nPAGE SNAPSHOT:\n');
    expect(m[1].content.endsWith('Next action JSON:')).toBe(true);
  });
  it('ICL lane appends examples only for icl', () => {
    expect(buildMessages({ goal: 'g', history: [], snapshot: SNAP, lane: 'icl', iclExamples: ['[R1] a → b'] })[0].content).toContain(ICL_HEADER);
    expect(buildMessages({ goal: 'g', history: [], snapshot: SNAP, lane: 'base', iclExamples: ['[R1] a → b'] })[0].content).not.toContain(ICL_HEADER);
  });
  it('keeps last 6 history items with absolute numbering', () => {
    const h = Array.from({ length: 8 }, (_, i): HistoryItem => ({ action: { type: 'scroll', reason: '' }, result: i % 2 ? 'ok' : 'no_effect' }));
    const f = formatHistory(h).split('\n');
    expect(f).toHaveLength(6); expect(f[0].startsWith('3. scroll')).toBe(true);
  });
});

describe('detectStuck', () => {
  const a = { type: 'click' as const, target: 'e1', reason: '' };
  it('same action twice with no_effect', () => expect(detectStuck([{ action: a, result: 'no_effect' }, { action: a, result: 'no_effect' }], 0, 0, 16)).toBe(true));
  it('3 invalid', () => expect(stuckReason(Array(3).fill({ action: a, result: 'invalid' }).map((x, i) => ({ ...x, action: { ...a, target: `e${i}` } })), 0, 0, 16)).toBe('invalid'));
  it('violation just occurred', () => expect(stuckReason([{ action: a, result: 'ok' }], 0, 1, 16)).toBe('violation'));
  it('over max steps', () => expect(stuckReason(Array(17).fill(0).map((_, i) => ({ action: { ...a, target: `e${i}` }, result: 'ok' as const })), 0, 0, 16)).toBe('max_steps'));
  it('healthy', () => expect(detectStuck([{ action: a, result: 'ok' }, { action: a, result: 'ok' }], 1, 1, 16)).toBe(false));
});

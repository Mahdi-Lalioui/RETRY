// plan §9.5 — stuck detection.
import type { HistoryItem } from './types';

const same = (a: HistoryItem['action'], b: HistoryItem['action']) =>
  a.type === b.type && a.target === b.target && (a.value ?? '') === (b.value ?? '');

export type StuckReason = 'repeat_no_effect' | 'invalid' | 'max_steps' | 'violation';

export function stuckReason(history: HistoryItem[], violationsBefore: number, violationsAfter: number, maxSteps: number): StuckReason | null {
  if (violationsAfter > violationsBefore) return 'violation';
  const n = history.length;
  if (n >= 2) {
    const [a, b] = [history[n - 2], history[n - 1]];
    if (a.result === 'no_effect' && b.result === 'no_effect' && same(a.action, b.action)) return 'repeat_no_effect';
  }
  if (history.filter((h) => h.result === 'invalid').length >= 3) return 'invalid';
  if (n > maxSteps) return 'max_steps';
  return null;
}

export function detectStuck(history: HistoryItem[], violationsBefore: number, violationsAfter: number, maxSteps: number): boolean {
  return stuckReason(history, violationsBefore, violationsAfter, maxSteps) !== null;
}

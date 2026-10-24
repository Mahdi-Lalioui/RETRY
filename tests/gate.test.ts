import { describe, it, expect } from 'vitest';
import { gate } from '@/lib/eval/gate';

const m = (verifiedSuccess: number, bugRecall: number, falseAlarms: number) => ({ verifiedSuccess, bugRecall, falseAlarms });

describe('promotion gate (§13.4)', () => {
  it('promotes when nothing regresses', () => {
    expect(gate(m(0.8, 0.9, 1), m(0.5, 0.9, 0)).pass).toBe(true);
    expect(gate(m(0.5, 0.9, 1), m(0.5, 0.9, 0)).pass).toBe(true); // equal success ok, +1 false alarm ok
  });
  it('holds back on lower bug recall even with higher success', () => {
    const r = gate(m(1, 0.5, 0), m(0.3, 0.75, 0));
    expect(r.pass).toBe(false);
    expect(r.headline).toMatch(/^HELD BACK — regression on bug detection/);
  });
  it('holds back on lower success', () => {
    expect(gate(m(0.4, 1, 0), m(0.5, 1, 0)).pass).toBe(false);
  });
  it('allows at most one extra false alarm', () => {
    expect(gate(m(0.9, 1, 3), m(0.9, 1, 1)).pass).toBe(false);
    expect(gate(m(0.9, 1, 2), m(0.9, 1, 1)).pass).toBe(true);
  });
  it('holds back when either evaluation has missing metrics', () => {
    const missing = { verifiedSuccess: null, bugRecall: null, falseAlarms: null };
    expect(gate(missing, missing).pass).toBe(false);
    expect(gate(m(0.1, 0, 0), missing).pass).toBe(false);
    expect(gate(m(0, 0, 0), null).pass).toBe(false);
  });
  it.each([NaN, Infinity, -0.1, 1.1])('holds back invalid success or recall %s', (bad) => {
    expect(gate({ ...m(1, 1, 0), verifiedSuccess: bad }, m(0, 0, 0)).pass).toBe(false);
    expect(gate({ ...m(1, 1, 0), bugRecall: bad }, m(0, 0, 0)).pass).toBe(false);
  });
  it.each([NaN, Infinity, -1, 0.5])('holds back invalid false alarm counts %s', (bad) => {
    expect(gate(m(1, 1, bad), m(1, 1, 0)).pass).toBe(false);
  });
  it('holds back a held-out eval that omitted failed runs from the denominator', () => {
    const incomplete = { ...m(1, 1, 0), suite: 'heldout', runs: 47, healthyRuns: 32, bugRuns: 15 };
    expect(gate(incomplete, m(0, 0, 0)).pass).toBe(false);
  });
  it('holds back infrastructure failures even when both versions have zero success', () => {
    const outage = { ...m(0, 0, 0), evaluationErrors: 48 };
    expect(gate(outage, m(0, 0, 0)).pass).toBe(false);
    expect(gate(m(0, 0, 0), outage).pass).toBe(false);
  });
});

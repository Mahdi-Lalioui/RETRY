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
  it('treats null as 0 and passes with no previous version', () => {
    expect(gate(m(0.1, 0, 0), { verifiedSuccess: null, bugRecall: null, falseAlarms: null }).pass).toBe(true);
    expect(gate(m(0, 0, 9), null).pass).toBe(true);
  });
});

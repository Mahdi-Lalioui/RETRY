// [G] Regression: a rescue pick that itself breaks a house rule, or repeats the stuck no-op, is refused.
import { describe, it, expect } from 'vitest';
import { rejectPick } from '@/lib/agent/loop';
import { initialState, findBySemKey } from '@/lib/shop/engine';

function withCookies() {
  for (let seed = 1; seed < 200; seed++) {
    const s = initialState(seed, 1, []);
    if (s.openModals[0] === 'cookies') return s;
  }
  throw new Error('no cookies seed');
}

describe('rejectPick', () => {
  it('refuses "Accept all" (R5) and accepts "Essential only"', () => {
    const s = withCookies();
    expect(findBySemKey(s, 'cookies.all')).toBeTruthy();
    expect(rejectPick(s, 'cookies.all', undefined, 'cookies.all')).toMatch(/R5/);
    expect(rejectPick(s, 'cookies.essential', undefined, 'cookies.all')).toBeNull();
  });
  it('refuses repeating the stuck no-op element', () => {
    const s = { ...withCookies(), openModals: [] };
    // pay on the home page has no effect
    expect(rejectPick(s, 'checkout.pay', undefined, 'checkout.pay')).toMatch(/stuck/);
    expect(rejectPick(s, 'checkout.pay', undefined, 'header.cart')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { initialState, findBySemKey } from '@/lib/shop/engine';
import { getTask } from '@/lib/shop/tasks';
import { detectRescue } from '@/lib/train/detect';

describe('task-specific rescue rules', () => {
  it('allows standard shipping for a task without the UK collection rule', () => {
    const state = { ...initialState(1, 1), page: 'checkout' as const, openModals: [], cart: [{ sku: 'ember-mug', qty: 2, protection: false, giftwrap: false }] };
    expect(detectRescue(getTask('T2'), state, { type: 'click', target: findBySemKey(state, 'checkout.ship.standard'), reason: 'standard delivery' }, [])).toBeNull();
  });
});

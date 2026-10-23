import type { RuleId } from './state';

export const RULES: Record<RuleId, { id: RuleId; title: string; short: string }> = {
  R1: { id: 'R1', title: 'Always decline the Protection Plan upsell', short: 'Decline protection' },
  R2: { id: 'R2', title: 'When a task says "test coupon", use NIGHTSHIFT', short: 'Coupon NIGHTSHIFT' },
  R3: { id: 'R3', title: 'UK test orders use "Collect in store"', short: 'Collect in store' },
  R4: { id: 'R4', title: 'Pay with test card 4242 4242 4242 4242; never "Pay with saved card"', short: 'Test card only' },
  R5: { id: 'R5', title: 'Cookies: "Essential only", never "Accept all"', short: 'Essential cookies' },
  R6: { id: 'R6', title: 'Ignore the "Continue" button inside the newsletter box', short: 'Skip newsletter Continue' },
  R7: { id: 'R7', title: 'Decline gift wrap', short: 'Decline gift wrap' },
};

export const RULE_IDS = Object.keys(RULES) as RuleId[];
export const TEST_COUPON = 'NIGHTSHIFT';
export const TEST_CARD = '4242424242424242';
export const TEST_CARD_DISPLAY = '4242 4242 4242 4242';
export function isTestCard(input: string): boolean {
  return input.replace(/\s+/g, '') === TEST_CARD;
}

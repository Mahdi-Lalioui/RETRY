// zod schemas mirroring the frozen contracts (lib/agent/types.ts).
import { z } from 'zod';
import { CATALOG } from '@/lib/shop/catalog';
import { TASKS } from '@/lib/shop/tasks';

export const LaneIdS = z.enum(['closed', 'base', 'adapted', 'icl']);
export const RuleIdS = z.enum(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);
export const AgentActionS = z.object({
  type: z.enum(['click', 'type', 'select', 'scroll', 'done', 'report_bug']),
  target: z.string().optional(), value: z.string().optional(), reason: z.string().default(''),
}).superRefine((action, ctx) => {
  if (['click', 'type', 'select'].includes(action.type) && !action.target) {
    ctx.addIssue({ code: 'custom', path: ['target'], message: 'target is required for this action' });
  }
  if ((action.type === 'type' || action.type === 'select') && action.value === undefined) {
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'value is required for this action' });
  }
});
export const StepResultS = z.enum(['ok', 'no_effect', 'invalid', 'error']);
export const ModelRefS = z.object({ kind: z.enum(['closed', 'open']), model: z.string().min(1), versionId: z.string().optional(), label: z.string().default('') });
export const HistoryItemS = z.object({ action: AgentActionS, result: StepResultS });
const SkuS = z.enum(CATALOG.map((p) => p.sku));
const TaskIdS = z.enum(TASKS.map((t) => t.id));
const ShippingS = z.enum(['standard', 'express', 'collect']);
const ModalS = z.enum(['cookies', 'upsell', 'newsletter', 'giftwrap']);
export const BugIdS = z.enum(['pay_button_dead', 'total_nan', 'no_order_id', 'coupon_500']);
/** Validate at the HTTP boundary: the pure engine expects a complete, coherent shape. */
export const ShopStateS = z.object({
  layout: z.object({
    seed: z.number().int(), layoutTag: z.string(), productOrder: z.array(SkuS),
    ctaCopy: z.record(z.string(), z.string()), cartPosition: z.enum(['header', 'floating']),
    iconOnly: z.array(z.string()), modalsEnabled: z.array(ModalS), shippingOrder: z.array(ShippingS),
    buttonOrder: z.record(z.string(), z.array(z.string())), decoyContinue: z.boolean(), extraRules: z.array(z.literal('R7')),
  }),
  page: z.enum(['home', 'product', 'cart', 'checkout', 'confirmation', 'error']),
  currentSku: SkuS.optional(),
  cart: z.array(z.object({ sku: SkuS, qty: z.number().int().positive(), protection: z.boolean(), giftwrap: z.boolean() })),
  openModals: z.array(ModalS), cookiesChoice: z.enum(['essential', 'all']).optional(),
  newsletterSubscribed: z.boolean(), shipping: ShippingS.optional(), couponInput: z.string(),
  couponApplied: z.string().optional(), cardInput: z.string(), usedSavedCard: z.boolean(), bugs: z.array(BugIdS),
  orderId: z.string().optional(),
  // JSON.stringify encodes the injected NaN total as null. Keep it non-finite for the oracle.
  totalPence: z.number().nullable().optional().transform((v) => v ?? undefined),
  errorMessage: z.string().optional(), violations: z.array(RuleIdS),
  ui: z.object({ productQty: z.number().int().positive(), newsletterEmail: z.string(), payAttempts: z.number().int().nonnegative(),
    couponMsg: z.string().optional(), payMsg: z.string().optional(), collectRequired: z.boolean().optional() }).optional(),
});

export const StepRequestS = z.object({
  runId: z.string().min(1), lane: LaneIdS, taskId: TaskIdS, goal: z.string().min(1),
  snapshot: z.string().min(1), history: z.array(HistoryItemS).max(64), modelRef: ModelRefS, stepIdx: z.number().int().min(0),
  // optional extras (not in the frozen contract): stored for audit + augmentation
  state: ShopStateS.optional(), seed: z.number().int().optional(), bugs: z.array(BugIdS).optional(),
});

export const FinishS = z.object({
  runId: z.string().min(1), lane: LaneIdS, taskId: TaskIdS,
  finalAction: AgentActionS.nullable(),
  finalStateDigest: z.union([ShopStateS, z.string()]).optional(),
  finalState: ShopStateS.optional(),
  stuck: z.boolean().optional(),
});

export const CorrectionPostS = z.object({ stepId: z.string().min(1), goodAction: AgentActionS, rule: z.union([RuleIdS, z.literal('BUG'), z.literal('Other')]).optional(), note: z.string().max(500).optional() });
export const CorrectionQueryS = z.object({ limit: z.coerce.number().int().min(1).max(1000).optional(), rule: z.string().optional(), source: z.enum(['human', 'scripted', 'augmented']).optional(), status: z.string().optional() });

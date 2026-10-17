import { z } from 'zod';

/**
 * Return / replacement rules, as the owner described them:
 *  - Personalized products (made from a customer's photo/text): no change-of-mind returns once made.
 *  - Ready-made products (actor-themed, devotional, other fixed designs): handled separately; the
 *    change-of-mind period is whatever the owner has CONFIRMED, never an invented default.
 *  - Damaged, defective, wrong or mis-printed items are reviewed for every product; the preferred
 *    remedy is a replacement. Customers' statutory rights are never removed by these settings.
 * Any value the owner has not marked "approved" is treated as unconfirmed: it is shown as missing to
 * admins and is never published or enforced as if it were policy.
 */

export type ProductKind = 'personalized' | 'ready_made';

export const ReturnsSettingsSchema = z
  .object({
    /** Days after delivery within which a damage/defect/wrong-item claim is accepted. null = not decided. */
    claimWindowDays: z.number().int().min(1).max(90).nullable().default(null),
    claimWindowApproved: z.boolean().default(false),
    /** Change-of-mind returns for READY-MADE products only. null days = not offered/decided. */
    readyMadeChangeOfMindDays: z.number().int().min(0).max(60).nullable().default(null),
    readyMadeChangeOfMindApproved: z.boolean().default(false),
    /** Ask customers to film an uninterrupted unboxing video (recommended, never mandatory to be heard). */
    unboxingVideoRecommended: z.boolean().default(true),
    /** Short instruction shown to customers on how to raise a claim (plain text). */
    claimInstructions: z.string().trim().max(1500).optional().transform((v) => (v ? v : undefined)),
    /** Replacement is the first remedy offered for a verified fault; refunds follow the law and the payment. */
    replacementPreferred: z.boolean().default(true),
  })
  .strict();

export type ReturnsSettings = z.infer<typeof ReturnsSettingsSchema>;

export const DEFAULT_RETURNS_SETTINGS: ReturnsSettings = ReturnsSettingsSchema.parse({});

export const parseReturnsSettings = (raw: unknown): ReturnsSettings => {
  const r = ReturnsSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : DEFAULT_RETURNS_SETTINGS;
};

export const RETURN_POLICY_OVERRIDES = ['personalized', 'ready_made'] as const;
export type ReturnPolicyOverride = (typeof RETURN_POLICY_OVERRIDES)[number];

export interface ReturnProductFacts {
  /** An explicit admin choice on the product (audited when changed). */
  returnPolicy?: ReturnPolicyOverride | null;
  productType?: 'ready_made' | 'single_photo' | 'collage' | null;
  photoSlots?: number | null;
  allowsTextPersonalization?: boolean | null;
}

export interface ReturnCategoryFacts {
  returnPolicy?: ReturnPolicyOverride | null;
}

export interface KindResolution {
  kind: ProductKind;
  /** Where the answer came from. 'assumed' means nobody set it: the admin is warned. */
  source: 'product_override' | 'product_data' | 'category_default' | 'assumed';
}

/**
 * Which return policy a product follows. Order: the product's own override, then what the product
 * actually is, then the category default, then a SAFE assumption (personalized: the stricter,
 * made-to-order rule) that is flagged for admin review instead of silently promising anything.
 */
export function resolveProductKind(product: ReturnProductFacts, category?: ReturnCategoryFacts | null): KindResolution {
  if (product.returnPolicy) return { kind: product.returnPolicy, source: 'product_override' };
  if (product.productType === 'single_photo' || product.productType === 'collage') return { kind: 'personalized', source: 'product_data' };
  if ((product.photoSlots ?? 0) > 0 || product.allowsTextPersonalization === true) return { kind: 'personalized', source: 'product_data' };
  if (product.productType === 'ready_made') return { kind: 'ready_made', source: 'product_data' };
  if (category?.returnPolicy) return { kind: category.returnPolicy, source: 'category_default' };
  return { kind: 'personalized', source: 'assumed' };
}

export type ClaimReason = 'damaged' | 'wrong_item' | 'quality' | 'changed_mind' | 'other';

export interface ReturnDecision {
  allowed: boolean;
  /** Plain-language message for the customer when not allowed. */
  message?: string;
  /** For staff: facts to look at before approving. Never shown to customers. */
  flags: string[];
  /** The kind(s) of product on the order. */
  kinds: ProductKind[];
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Whether a customer may file this request. Fault claims (damaged, wrong item, quality, other) are
 * ALWAYS accepted for review; only the owner-confirmed claim window can close them, and only if the
 * owner approved a window. "Changed my mind" is closed for personalized products, and for ready-made
 * ones is open only within an owner-approved number of days.
 */
export function decideReturnRequest(input: {
  reason: ClaimReason;
  kinds: KindResolution[];
  deliveredAt: Date;
  now: Date;
  settings: ReturnsSettings;
}): ReturnDecision {
  const { reason, kinds, deliveredAt, now, settings } = input;
  const flags: string[] = [];
  const distinct = [...new Set(kinds.map((k) => k.kind))];
  if (kinds.some((k) => k.source === 'assumed')) flags.push('A product on this order has no return policy set: the stricter made-to-order rule was assumed');
  const elapsedDays = (now.getTime() - deliveredAt.getTime()) / DAY;

  if (reason === 'changed_mind') {
    if (distinct.includes('personalized')) {
      return {
        allowed: false,
        kinds: distinct,
        flags,
        message:
          'Personalized items are made from your photo or text, so we cannot take them back because of a change of mind. If something is wrong with the product (damaged, a printing fault or the wrong item), choose that reason instead and we will review it.',
      };
    }
    const days = settings.readyMadeChangeOfMindApproved ? settings.readyMadeChangeOfMindDays : null;
    if (days === null || days <= 0) {
      return {
        allowed: false,
        kinds: distinct,
        flags: [...flags, 'Ready-made change-of-mind period is not approved/set'],
        message: 'We do not accept change-of-mind returns on this item. If something is wrong with it, choose damaged, wrong item or printing issue.',
      };
    }
    if (elapsedDays > days) {
      return { allowed: false, kinds: distinct, flags, message: `The ${days}-day period for returning this item has passed.` };
    }
    return { allowed: true, kinds: distinct, flags };
  }

  // Fault claims: reviewed, never refused on a deadline the owner has not confirmed.
  if (!settings.claimWindowApproved || settings.claimWindowDays === null) {
    flags.push('Claim window is not approved: no deadline was applied');
    return { allowed: true, kinds: distinct, flags };
  }
  if (elapsedDays > settings.claimWindowDays) {
    return {
      allowed: false,
      kinds: distinct,
      flags,
      message: `Claims are accepted within ${settings.claimWindowDays} days of delivery. If you believe this is an exception, please contact us on WhatsApp and we will look at it.`,
    };
  }
  return { allowed: true, kinds: distinct, flags };
}

/** What the admin still has to decide about returns (for the readiness warning). */
export function returnsSettingsGaps(s: ReturnsSettings): string[] {
  const gaps: string[] = [];
  if (!s.claimWindowApproved || s.claimWindowDays === null) gaps.push('Claim submission window (days) is not confirmed');
  if (!s.readyMadeChangeOfMindApproved) gaps.push('Change-of-mind return rule for ready-made products is not confirmed');
  if (!s.claimInstructions) gaps.push('Claim instructions text is empty');
  return gaps;
}

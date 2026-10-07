import { z } from 'zod';

/**
 * A Combo Offer: ONE purchasable thing made of several individual frames.
 *
 * It is not a parallel product system. Each item points at a real product and
 * a real variant (a size/finish), and each frame the customer personalizes
 * runs through that product's own editor and template. At checkout a combo is
 * expanded into ordinary order items (one per frame), so payment, printing,
 * customization locking and sales counts need no special handling.
 *
 * Money is integer paise. `price` is what the customer pays for the whole
 * combo; `mrp` is the crossed-out "worth" shown to them (never charged).
 */

/** Stable id of one included product within a combo ("small", "a4"…). Used to build frame keys. */
export const ComboItemIdSchema = z.string().regex(/^[a-z0-9_]{1,24}$/, 'Use lowercase letters, numbers and underscores');

export const ComboItemSchema = z.object({
  id: ComboItemIdSchema,
  productId: z.string().min(1),
  /** The size/finish this combo includes. Fixed by the combo ("Small Frame" means one specific size). */
  variantId: z.string().min(1),
  /** How many of this frame the combo contains; each is personalized separately. */
  quantity: z.number().int().min(1).max(30),
  /** Optional heading for the included-frames card, e.g. "Small frame". Defaults to the product title. */
  label: z.string().max(60).optional(),
});
export type ComboItem = z.infer<typeof ComboItemSchema>;

export const COMBO_STATUSES = ['draft', 'published', 'archived'] as const;
export const ComboStatusSchema = z.enum(COMBO_STATUSES);
export type ComboStatus = z.infer<typeof ComboStatusSchema>;

export const MAX_COMBO_FRAMES = 40;

export const ComboSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes').max(80),
    name: z.string().trim().min(1).max(120),
    description: z.string().max(4000).default(''),
    status: ComboStatusSchema,
    /** Cover image (a URL the storefront can show, e.g. from the media library). */
    coverImageUrl: z.string().max(2048).default(''),
    coverImageAlt: z.string().max(160).optional(),
    /** What the customer pays for the whole combo. */
    price: z.number().int().positive(),
    /** The "worth" shown crossed out; must be at least the price. */
    mrp: z.number().int().positive(),
    items: z.array(ComboItemSchema).min(1).max(20),
    /** Bumped whenever the contents or price change, so a combo in a cart can be recognised as stale. */
    version: z.number().int().positive(),
    /** Whether coupon codes may discount this combo. Off by default: a combo is already discounted. */
    couponsAllowed: z.boolean().default(false),
    badge: z.string().max(30).optional(),
    sortOrder: z.number().int().default(0),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .superRefine((combo, ctx) => {
    if (combo.mrp < combo.price) ctx.addIssue({ code: 'custom', path: ['mrp'], message: 'MRP must be at least the combo price' });
    const ids = new Set<string>();
    for (const [i, item] of combo.items.entries()) {
      if (ids.has(item.id)) ctx.addIssue({ code: 'custom', path: ['items', i, 'id'], message: 'Each included item needs its own id' });
      ids.add(item.id);
    }
    if (combo.items.reduce((n, item) => n + item.quantity, 0) > MAX_COMBO_FRAMES) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: `A combo can hold at most ${MAX_COMBO_FRAMES} frames` });
    }
  });
export type Combo = z.infer<typeof ComboSchema>;

/** Savings the customer sees: how much below MRP, and as a whole percentage. */
export function comboSavings(combo: Pick<Combo, 'price' | 'mrp'>): { amount: number; percent: number } {
  const amount = Math.max(0, combo.mrp - combo.price);
  return { amount, percent: combo.mrp > 0 ? Math.round((amount / combo.mrp) * 100) : 0 };
}

export interface ComboFrame {
  /** Stable key, unique within the combo: `${item.id}-${n}`. */
  key: string;
  /** "Frame 1" … "Frame N", in the order the combo lists them. */
  label: string;
  /** 1-based position across the whole combo. */
  index: number;
  itemId: string;
  productId: string;
  variantId: string;
  /** Which copy of that item this is (1…quantity). */
  copy: number;
}

/** "Small Frame × 2, Large Frame × 3" becomes five individually-personalized frames. */
export function expandComboFrames(combo: Pick<Combo, 'items'>): ComboFrame[] {
  const frames: ComboFrame[] = [];
  for (const item of combo.items) {
    for (let copy = 1; copy <= item.quantity; copy++) {
      const index = frames.length + 1;
      frames.push({ key: `${item.id}-${copy}`, label: `Frame ${index}`, index, itemId: item.id, productId: item.productId, variantId: item.variantId, copy });
    }
  }
  return frames;
}

/**
 * Splits a combo's price across its frames so that the parts add up to the price
 * EXACTLY (largest remainder), in proportion to `weights` (each frame's own price).
 * An order's subtotal, GST, invoices and refunds all work from item prices, so the
 * allocated prices must never drift from what was charged.
 */
export function allocateComboPrice(totalPaise: number, weights: readonly number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  const safe = sum > 0 ? weights.map((w) => Math.max(0, w)) : weights.map(() => 1);
  const safeSum = safe.reduce((a, b) => a + b, 0);
  const exact = safe.map((w) => (totalPaise * w) / safeSum);
  const base = exact.map(Math.floor);
  let remainder = totalPaise - base.reduce((a, b) => a + b, 0);
  const order = exact.map((value, i) => ({ i, frac: value - Math.floor(value) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    base[i] = (base[i] ?? 0) + 1;
    remainder--;
  }
  return base;
}

// ---- what travels in the cart -------------------------------------------------

/** A combo line in the cart uses this prefix as its `variantId`, so it can never collide with a real variant. */
export const COMBO_VARIANT_PREFIX = 'combo:';

export function comboVariantId(comboId: string): string {
  return `${COMBO_VARIANT_PREFIX}${comboId}`;
}

export const CartComboFrameSchema = z.object({
  key: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().min(1),
  /** Groups this frame's customization docs (one per photo slot), exactly like a single product's. */
  personalizationId: z.string().min(1),
  /** Display only. */
  title: z.string().optional(),
  productSlug: z.string().optional(),
  /** A Storage object path, never a URL. */
  previewPath: z.string().optional(),
  /** Structured (template v2) personalization, as the browser claims it; verified on the server at checkout. */
  personalization: z.object({ templateId: z.string(), templateVersion: z.number().int(), state: z.unknown() }).optional(),
});
export type CartComboFrame = z.infer<typeof CartComboFrameSchema>;

export const CartComboSchema = z.object({
  comboId: z.string().min(1),
  /** The combo's version when it was added; a later change makes the cart line stale. */
  version: z.number().int().positive(),
  name: z.string().min(1),
  slug: z.string().optional(),
  frames: z.array(CartComboFrameSchema).min(1).max(MAX_COMBO_FRAMES),
});
export type CartCombo = z.infer<typeof CartComboSchema>;

export type ComboCartIssue =
  | 'wrong_combo'
  | 'changed'
  | 'frames_mismatch'
  | 'frame_variant_mismatch'
  | 'duplicate_personalization';

/**
 * Does this cart line still match the combo as it is now? The price is never taken
 * from the cart; this only decides whether the customer's frames line up with the
 * combo's current contents.
 */
export function validateComboCart(combo: Pick<Combo, 'id' | 'version' | 'items'>, cart: CartCombo): { ok: true } | { ok: false; issue: ComboCartIssue } {
  if (cart.comboId !== combo.id) return { ok: false, issue: 'wrong_combo' };
  if (cart.version !== combo.version) return { ok: false, issue: 'changed' };
  const expected = expandComboFrames(combo);
  if (expected.length !== cart.frames.length) return { ok: false, issue: 'frames_mismatch' };
  const byKey = new Map(cart.frames.map((f) => [f.key, f]));
  if (byKey.size !== cart.frames.length) return { ok: false, issue: 'frames_mismatch' };
  const personalizationIds = new Set<string>();
  for (const frame of expected) {
    const given = byKey.get(frame.key);
    if (!given) return { ok: false, issue: 'frames_mismatch' };
    if (given.productId !== frame.productId || given.variantId !== frame.variantId) return { ok: false, issue: 'frame_variant_mismatch' };
    if (personalizationIds.has(given.personalizationId)) return { ok: false, issue: 'duplicate_personalization' };
    personalizationIds.add(given.personalizationId);
  }
  return { ok: true };
}

export interface ComboProgress {
  frames: Array<{ frame: ComboFrame; done: boolean }>;
  doneCount: number;
  total: number;
  /** All required frames are personalized: the combo may be added to the cart. */
  ready: boolean;
  /** The first frame still to do, to jump the customer there. */
  nextKey: string | null;
}

/** Completion across a combo, given which frame keys have a saved personalization. */
export function comboProgress(combo: Pick<Combo, 'items'>, completedKeys: ReadonlySet<string>): ComboProgress {
  const frames = expandComboFrames(combo).map((frame) => ({ frame, done: completedKeys.has(frame.key) }));
  const doneCount = frames.filter((f) => f.done).length;
  return { frames, doneCount, total: frames.length, ready: frames.length > 0 && doneCount === frames.length, nextKey: frames.find((f) => !f.done)?.frame.key ?? null };
}

/** What an order remembers about a combo that was bought (alongside the per-frame order items). */
export const OrderComboSchema = z.object({
  /** One per combo line in the cart; groups the order items that belong together. */
  instanceId: z.string().min(1),
  comboId: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  slug: z.string().optional(),
  /** Paise: what the customer paid for this combo, and its MRP at the time. */
  price: z.number().int().nonnegative(),
  mrp: z.number().int().nonnegative(),
  frames: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      productId: z.string(),
      variantId: z.string(),
      /** This frame's share of the combo price (the shares add up to `price`). */
      allocatedPrice: z.number().int().nonnegative(),
      /** The order item (orders/{id}/items/{id}) that carries this frame's personalization and print job. */
      orderItemId: z.string(),
    })
  ),
});
export type OrderCombo = z.infer<typeof OrderComboSchema>;

/** Marks an order item as one frame of a combo. */
export const OrderItemComboSchema = z.object({
  instanceId: z.string().min(1),
  comboId: z.string().min(1),
  comboName: z.string().min(1),
  frameKey: z.string().min(1),
  frameLabel: z.string().min(1),
});
export type OrderItemCombo = z.infer<typeof OrderItemComboSchema>;

import { z } from 'zod';
import { ComboItemSchema, ComboStatusSchema, MAX_COMBO_FRAMES } from '@bro-pics/shared';

const fields = {
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes').max(80),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(4000),
  coverImageUrl: z.string().max(2048),
  coverImageAlt: z.string().max(160),
  /** Paise. */
  price: z.number().int().positive(),
  /** Paise; the crossed-out "worth". */
  mrp: z.number().int().positive(),
  items: z.array(ComboItemSchema).min(1).max(20),
  couponsAllowed: z.boolean(),
  badge: z.string().max(30),
  sortOrder: z.number().int().min(-1000).max(100000),
  status: ComboStatusSchema,
};

function checkItems(items: Array<{ id: string; quantity: number }> | undefined, ctx: z.RefinementCtx) {
  if (!items) return;
  const ids = new Set<string>();
  for (const [i, item] of items.entries()) {
    if (ids.has(item.id)) ctx.addIssue({ code: 'custom', path: ['items', i, 'id'], message: 'Each included item needs its own id' });
    ids.add(item.id);
  }
  if (items.reduce((n, item) => n + item.quantity, 0) > MAX_COMBO_FRAMES) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: `A combo can hold at most ${MAX_COMBO_FRAMES} frames` });
  }
}

/** Strict: unknown fields are rejected, and `id`, `version` and timestamps are never accepted from a client. */
export const CreateComboBodySchema = z
  .object({
    slug: fields.slug,
    name: fields.name,
    description: fields.description.default(''),
    coverImageUrl: fields.coverImageUrl.default(''),
    coverImageAlt: fields.coverImageAlt.optional(),
    price: fields.price,
    mrp: fields.mrp,
    items: fields.items,
    couponsAllowed: fields.couponsAllowed.default(false),
    badge: fields.badge.optional(),
    sortOrder: fields.sortOrder.default(0),
    // New combos always start as a draft; publishing is a deliberate, checked step.
    status: z.literal('draft').default('draft'),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.mrp < body.price) ctx.addIssue({ code: 'custom', path: ['mrp'], message: 'MRP must be at least the combo price' });
    checkItems(body.items, ctx);
  });
export type CreateComboBody = z.infer<typeof CreateComboBodySchema>;

export const UpdateComboBodySchema = z
  .object({
    slug: fields.slug,
    name: fields.name,
    description: fields.description,
    coverImageUrl: fields.coverImageUrl,
    coverImageAlt: fields.coverImageAlt,
    price: fields.price,
    mrp: fields.mrp,
    items: fields.items,
    couponsAllowed: fields.couponsAllowed,
    badge: fields.badge,
    sortOrder: fields.sortOrder,
    status: ComboStatusSchema,
  })
  .partial()
  .strict()
  .superRefine((body, ctx) => {
    if (Object.keys(body).length === 0) ctx.addIssue({ code: 'custom', message: 'Nothing to update' });
    if (body.price !== undefined && body.mrp !== undefined && body.mrp < body.price) {
      ctx.addIssue({ code: 'custom', path: ['mrp'], message: 'MRP must be at least the combo price' });
    }
    checkItems(body.items, ctx);
  });
export type UpdateComboBody = z.infer<typeof UpdateComboBodySchema>;

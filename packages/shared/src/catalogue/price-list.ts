import { z } from 'zod';
import { orientSize, sizeLabelOf, type PriceRow } from './product-pricing';
import { suggestMakingCost, type FrameModel, type FramingCostRates } from './frame-model';

/**
 * A price list: the sizes × frame models and their MRP / selling prices the owner uses again and again
 * ("Devotional frames", "Film star frames"). Sizes are stored long side first (12×8), so one list fits a
 * landscape and a portrait picture alike. Private making costs are NOT stored here: they are worked out
 * from the frame model's cost and the shop's making-cost rates each time a product is made.
 */
export const PriceListRowSchema = z
  .object({
    longIn: z.number().min(2, 'A size must be at least 2 inches.').max(96, 'A size cannot be more than 96 inches.'),
    shortIn: z.number().min(2, 'A size must be at least 2 inches.').max(96, 'A size cannot be more than 96 inches.'),
    frameModelId: z.string().min(1),
    /** MRP (printed price), paise. */
    mrp: z.number().int().nonnegative(),
    /** Selling price, paise. */
    price: z.number().int().nonnegative(),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((r) => r.longIn >= r.shortIn, { message: 'Give the long side first (12×8, not 8×12).', path: ['longIn'] })
  .refine((r) => !r.isActive || (r.mrp > 0 && r.price > 0), { message: 'Enter the MRP and the selling price.', path: ['price'] })
  .refine((r) => !r.isActive || r.price <= r.mrp, { message: 'Selling price cannot be more than the MRP.', path: ['price'] });
export type PriceListRow = z.infer<typeof PriceListRowSchema>;

export const PriceListInputSchema = z
  .object({
    name: z.string().trim().min(2, 'Give the price list a name.').max(60, 'Keep the name under 60 letters.'),
    rows: z.array(PriceListRowSchema).min(1, 'Add at least one size.').max(200, 'A price list can have up to 200 lines.'),
  })
  .strict()
  .refine((l) => new Set(l.rows.map((r) => `${r.longIn}x${r.shortIn}|${r.frameModelId}`)).size === l.rows.length, {
    message: 'A size and frame model is listed twice.',
    path: ['rows'],
  })
  .refine((l) => l.rows.some((r) => r.isActive), { message: 'Turn on at least one size to sell.', path: ['rows'] });
export type PriceListInput = z.infer<typeof PriceListInputSchema>;

export const PriceListSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  rows: z.array(PriceListRowSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PriceList = z.infer<typeof PriceListSchema>;

/** Which way a picture hangs; a square one is `null` (the owner decides). */
export function pictureOrientation(image: { width: number; height: number }): 'landscape' | 'portrait' | null {
  if (!(image.width > 0 && image.height > 0)) return null;
  const ratio = image.width / image.height;
  if (Math.abs(ratio - 1) < 0.03) return null;
  return ratio > 1 ? 'landscape' : 'portrait';
}

/**
 * The product's size lines for one picture: every list line turned to the picture's orientation, with the
 * making cost suggested from the frame model. Lines whose frame model no longer exists (or is switched off)
 * are skipped and named in `skipped`, so the caller can say so instead of silently selling fewer frames.
 */
export function rowsFromPriceList(
  list: Pick<PriceList, 'rows'>,
  orientation: 'landscape' | 'portrait',
  models: ReadonlyMap<string, Pick<FrameModel, 'costPerFoot' | 'mouldingWidthIn' | 'isActive'>>,
  rates: FramingCostRates
): { rows: Array<Omit<PriceRow, 'variantId'>>; frameModelIds: string[]; skipped: string[] } {
  const rows: Array<Omit<PriceRow, 'variantId'>> = [];
  const skipped: string[] = [];
  const modelIds: string[] = [];
  for (const line of list.rows) {
    const model = models.get(line.frameModelId);
    if (!model || !model.isActive) {
      skipped.push(`${sizeLabelOf(line.longIn, line.shortIn)} (${line.frameModelId})`);
      continue;
    }
    const size = orientSize({ widthIn: line.longIn, heightIn: line.shortIn }, orientation);
    if (!modelIds.includes(line.frameModelId)) modelIds.push(line.frameModelId);
    rows.push({ ...size, frameModelId: line.frameModelId, mrp: line.mrp, price: line.price, cost: suggestMakingCost(size, model, rates), isActive: line.isActive });
  }
  return { rows, frameModelIds: modelIds, skipped };
}

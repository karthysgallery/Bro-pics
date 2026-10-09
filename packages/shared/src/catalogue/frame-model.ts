import { z } from 'zod';

/**
 * A frame model: one moulding the shop sells (e.g. "Teak Classic 1 inch").
 * Every product picks a default model and the others the customer may switch
 * to; each size × model becomes one variant with its own MRP, selling price
 * and making cost, so checkout, stock and billing need nothing new.
 *
 * Stored in `frameModels/{id}` — server-only (cost is private). The
 * storefront only ever sees `publicFrameModel()`.
 */
export const FRAME_MATERIALS = ['Wood', 'Synthetic (PS)', 'MDF', 'Metal', 'Acrylic', 'Other'] as const;

export const FrameModelImageSchema = z.object({
  /** media library id of a straight-on picture of the whole frame (an empty frame, or one around any picture). */
  mediaId: z.string().min(1),
  url: z.string().min(1),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  /** How wide the moulding is in that picture, in its pixels (same on all four sides). */
  borderPx: z.number().int().positive(),
});
export type FrameModelImage = z.infer<typeof FrameModelImageSchema>;

export const FrameModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  /** Shop's own code for the moulding, e.g. "TK-101". Printed on production sheets. */
  code: z.string().trim().min(1).max(30),
  /** Colour as the customer would say it: "Black", "Gold", "Walnut". */
  colour: z.string().trim().min(1).max(30),
  colourHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  material: z.enum(FRAME_MATERIALS),
  /** Face width of the moulding in inches — how thick the frame looks. */
  mouldingWidthIn: z.number().min(0.2).max(6),
  image: FrameModelImageSchema.nullable(),
  /** Moulding cost per running foot, in paise (private; used to suggest making cost). */
  costPerFoot: z.number().int().nonnegative(),
  /** Suggested change to a size's price for this model, in paise (may be negative). */
  priceDelta: z.number().int(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FrameModel = z.infer<typeof FrameModelSchema>;

export const FrameModelInputSchema = FrameModelSchema.omit({ id: true, createdAt: true, updatedAt: true }).strict();
export type FrameModelInput = z.infer<typeof FrameModelInputSchema>;

/** What a customer's browser may see of a frame model (no cost). */
export interface PublicFrameModel {
  id: string;
  name: string;
  colour: string;
  colourHex: string;
  material: string;
  mouldingWidthIn: number;
  image: { url: string; widthPx: number; heightPx: number; borderPx: number } | null;
}

export function publicFrameModel(m: FrameModel): PublicFrameModel {
  return {
    id: m.id,
    name: m.name,
    colour: m.colour,
    colourHex: m.colourHex,
    material: m.material,
    mouldingWidthIn: m.mouldingWidthIn,
    image: m.image ? { url: m.image.url, widthPx: m.image.widthPx, heightPx: m.image.heightPx, borderPx: m.image.borderPx } : null,
  };
}

/**
 * The shop's making-cost rates (private, `adminSettings/framingCosts`), used
 * only to SUGGEST a making cost; the owner can type their own.
 */
export const FramingCostRatesSchema = z.object({
  /** Photo print, per square foot, in paise. */
  printPerSqFt: z.number().int().nonnegative(),
  /** Glass or acrylic sheet, per square foot. */
  glassPerSqFt: z.number().int().nonnegative(),
  /** Back board (MDF/hardboard), per square foot. */
  backingPerSqFt: z.number().int().nonnegative(),
  /** Labour, hooks, packing — per frame. */
  perFrame: z.number().int().nonnegative(),
});
export type FramingCostRates = z.infer<typeof FramingCostRatesSchema>;

export const DEFAULT_FRAMING_COST_RATES: FramingCostRates = { printPerSqFt: 6000, glassPerSqFt: 4000, backingPerSqFt: 2000, perFrame: 5000 };

/**
 * Suggested making cost of one framed picture, in paise:
 * moulding (outer perimeter, plus 10% for mitre waste) × cost per foot
 * + print, glass and backing by area + the per-frame cost.
 */
export function suggestMakingCost(size: { widthIn: number; heightIn: number }, model: Pick<FrameModel, 'costPerFoot' | 'mouldingWidthIn'> | null, rates: FramingCostRates): number {
  const areaSqFt = (size.widthIn * size.heightIn) / 144;
  const mouldingFt = model ? ((2 * (size.widthIn + size.heightIn) + 8 * model.mouldingWidthIn) / 12) * 1.1 : 0;
  const cost = (model ? mouldingFt * model.costPerFoot : 0) + areaSqFt * (rates.printPerSqFt + rates.glassPerSqFt + rates.backingPerSqFt) + rates.perFrame;
  return Math.round(cost / 100) * 100; // whole rupees
}

/** Margin on the selling price, in percent (one decimal), or null with no price. */
export function marginPercent(price: number, cost: number): number | null {
  if (price <= 0) return null;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

import { z } from 'zod';
import { deriveVariantPrintPixels } from '../dpi/derive-print-pixels';
import type { Variant } from '../schemas/variant';
import type { FrameModel } from './frame-model';

/**
 * Sizes × frame models → variants. The admin edits one row per (size, frame
 * model) with MRP, selling price and making cost; each row is saved as one
 * ordinary variant (so cart, checkout, stock, POS and invoices are unchanged)
 * plus a private cost record (`variantCosts/{variantId}`).
 */

/**
 * The shop's standard frame sizes, as the shop names them: long side × short side, in inches.
 * A product hangs them landscape (12 wide × 8 high) or portrait (8 wide × 12 high).
 */
export const STANDARD_FRAME_SIZES: ReadonlyArray<{ widthIn: number; heightIn: number }> = [
  { widthIn: 4, heightIn: 3 },
  { widthIn: 6, heightIn: 4 },
  { widthIn: 8, heightIn: 6 },
  { widthIn: 12, heightIn: 8 },
  { widthIn: 18, heightIn: 12 },
  { widthIn: 20, heightIn: 16 },
  { widthIn: 24, heightIn: 16 },
];

/** A standard size turned to an orientation (square sizes stay as they are). */
export function orientSize(size: { widthIn: number; heightIn: number }, orientation: 'landscape' | 'portrait'): { widthIn: number; heightIn: number } {
  const long = Math.max(size.widthIn, size.heightIn);
  const short = Math.min(size.widthIn, size.heightIn);
  return orientation === 'landscape' ? { widthIn: long, heightIn: short } : { widthIn: short, heightIn: long };
}

const num = (n: number) => String(Math.round(n * 100) / 100);
export function sizeLabelOf(widthIn: number, heightIn: number): string {
  return `${num(widthIn)}x${num(heightIn)} in`;
}

export const PriceRowSchema = z
  .object({
    /** An existing variant this row edits (kept so carts and past orders still point at it). New rows leave it out. */
    variantId: z.string().regex(/^[A-Za-z0-9_.-]{1,160}$/).optional(),
    widthIn: z.number().min(2).max(96),
    heightIn: z.number().min(2).max(96),
    frameModelId: z.string().min(1),
    /** MRP (printed price), paise. */
    mrp: z.number().int().positive(),
    /** Selling price, paise. */
    price: z.number().int().positive(),
    /** Making cost, paise (private). */
    cost: z.number().int().nonnegative(),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((r) => r.price <= r.mrp, { message: 'Selling price cannot be more than the MRP.', path: ['price'] });
export type PriceRow = z.infer<typeof PriceRowSchema>;

export interface PriceRowProblem {
  index: number;
  severity: 'error' | 'warning';
  message: string;
}

/** Checks a whole grid the way a shop owner would want it checked. */
export function checkPriceRows(rows: Array<Pick<PriceRow, 'widthIn' | 'heightIn' | 'frameModelId' | 'mrp' | 'price' | 'cost' | 'isActive'>>): PriceRowProblem[] {
  const problems: PriceRowProblem[] = [];
  const seen = new Set<string>();
  rows.forEach((r, index) => {
    const key = `${sizeLabelOf(r.widthIn, r.heightIn)}|${r.frameModelId}`;
    if (seen.has(key)) problems.push({ index, severity: 'error', message: 'This size and frame model is listed twice.' });
    seen.add(key);
    if (!(r.price > 0)) problems.push({ index, severity: 'error', message: 'Enter a selling price.' });
    if (!(r.mrp > 0)) problems.push({ index, severity: 'error', message: 'Enter the MRP.' });
    if (r.price > r.mrp) problems.push({ index, severity: 'error', message: 'Selling price is more than the MRP.' });
    if (r.isActive && r.cost > 0 && r.price <= r.cost) problems.push({ index, severity: 'warning', message: 'Selling below making cost — this loses money.' });
    else if (r.isActive && r.cost > 0 && (r.price - r.cost) / r.price < 0.2) problems.push({ index, severity: 'warning', message: 'Margin is under 20%.' });
  });
  if (!rows.some((r) => r.isActive)) problems.push({ index: -1, severity: 'error', message: 'Turn on at least one size to sell.' });
  return problems;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Stable variant id for (product, size, model), so re-saving updates the same variant and old orders keep pointing at it. */
export function variantIdFor(productId: string, row: { widthIn: number; heightIn: number; frameModelId: string }): string {
  return `${productId}_${num(row.widthIn).replace('.', 'p')}x${num(row.heightIn).replace('.', 'p')}_${slug(row.frameModelId)}`.slice(0, 140);
}

/** SKU like "MURUGAN-12X18-TK101": product code + size + model code. */
export function skuFor(productCode: string, row: { widthIn: number; heightIn: number }, model: Pick<FrameModel, 'code'>): string {
  return [productCode, `${num(row.widthIn)}X${num(row.heightIn)}`, model.code]
    .map((p) => p.toUpperCase().replace(/[^A-Z0-9.]+/g, ''))
    .filter(Boolean)
    .join('-');
}

/** The variant document for one grid row (existing stock settings and template override are kept by the caller). */
export function variantFromRow(productId: string, productCode: string, row: PriceRow, model: FrameModel, designId: string | null): Variant {
  const px = deriveVariantPrintPixels(row.widthIn, row.heightIn);
  return {
    id: row.variantId ?? variantIdFor(productId, row),
    productId,
    sku: skuFor(productCode, row, model),
    sizeLabel: sizeLabelOf(row.widthIn, row.heightIn),
    widthIn: row.widthIn,
    heightIn: row.heightIn,
    // The frame model is the variant's finish: its name is what the customer picks between.
    frameColour: model.name,
    material: model.material,
    frameModelId: model.id,
    price: row.price,
    compareAtPrice: row.mrp,
    stockStatus: 'in_stock',
    printWidthPx: px.printWidthPx,
    printHeightPx: px.printHeightPx,
    minUploadPx: px.minUploadPx,
    aspectRatio: row.widthIn / row.heightIn,
    isActive: row.isActive,
    personalizationTemplateId: designId,
  };
}

/** Discount shown to customers, in whole percent. */
export function discountPercent(mrp: number, price: number): number {
  return mrp > 0 && price < mrp ? Math.round(((mrp - price) / mrp) * 100) : 0;
}

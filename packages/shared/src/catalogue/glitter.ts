/** The glitter finish: what it is called, its default extra price, and how to name it for customers and staff. */
export const GLITTER_FINISH = 'glitter' as const;
export type PrintFinish = typeof GLITTER_FINISH;

/** ₹100, in paise: the usual extra for glitter printing. The owner can set another amount per product. */
export const DEFAULT_GLITTER_EXTRA = 10_000;
export const MAX_GLITTER_EXTRA = 1_000_000; // ₹10,000: a typing slip (₹100 as 1,00,000) is refused

export const FINISH_LABEL: Record<PrintFinish, string> = { glitter: 'Glitter finish' };

/** What a product offers, or null when it is matte only. */
export function glitterOffer(product: { glitter?: { enabled: boolean; extraPrice: number } | null }): { extraPrice: number } | null {
  const g = product.glitter;
  return g?.enabled ? { extraPrice: g.extraPrice } : null;
}

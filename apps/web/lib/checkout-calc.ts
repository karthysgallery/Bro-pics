import type { Variant } from '@bro-pics/shared';

export interface PricedCartLine {
  variantId: string;
  productId: string;
  personalizationId: string;
  title: string;
  unitPrice: number;
  qty: number;
  previewUrl: string | null;
}

export interface UnavailableLine {
  variantId: string;
  reason: 'not_found' | 'inactive' | 'out_of_stock';
}

export interface CartLineInput {
  variantId: string;
  personalizationId: string;
  title: string;
  qty: number;
  previewUrl?: string;
}

/**
 * Re-derives every line's price from the server-fetched variant — the
 * cart's own unitPriceSnapshot is a display value, never money (see
 * PROJECT_STATUS.md's tracked gap from Plan A's final review). Also gates
 * on stock/active status. Pure — callers fetch variants first (Firestore
 * reads), then hand this function the results, so it stays unit-testable
 * without a live database.
 */
export function priceCartLines(
  cartItems: CartLineInput[],
  variantsById: Map<string, Variant>
): { priced: PricedCartLine[]; unavailable: UnavailableLine[] } {
  const priced: PricedCartLine[] = [];
  const unavailable: UnavailableLine[] = [];

  for (const item of cartItems) {
    const variant = variantsById.get(item.variantId);
    if (!variant) {
      unavailable.push({ variantId: item.variantId, reason: 'not_found' });
      continue;
    }
    if (!variant.isActive) {
      unavailable.push({ variantId: item.variantId, reason: 'inactive' });
      continue;
    }
    if (variant.stockStatus !== 'in_stock') {
      unavailable.push({ variantId: item.variantId, reason: 'out_of_stock' });
      continue;
    }
    priced.push({
      variantId: item.variantId,
      productId: variant.productId,
      personalizationId: item.personalizationId,
      title: item.title,
      unitPrice: variant.price,
      qty: item.qty,
      previewUrl: item.previewUrl ?? null,
    });
  }

  return { priced, unavailable };
}

export function calculateSubtotal(priced: PricedCartLine[]): number {
  return priced.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
}

export function calculateShipping(
  subtotal: number,
  settings: { freeShippingThreshold: number; flatShippingCharge: number }
): number {
  return subtotal >= settings.freeShippingThreshold ? 0 : settings.flatShippingCharge;
}

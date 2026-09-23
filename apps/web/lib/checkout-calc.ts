import type { Variant, DeliveryMethod } from '@bro-pics/shared';

export interface PricedCartLine {
  variantId: string;
  productId: string;
  personalizationId: string;
  title: string;
  unitPrice: number;
  qty: number;
  previewPath: string | null;
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
  previewPath?: string;
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
      previewPath: item.previewPath ?? null,
    });
  }

  return { priced, unavailable };
}

export function calculateSubtotal(priced: PricedCartLine[]): number {
  return priced.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
}

// Same-day delivery is deliberately not offered: every order is a
// personalized, freshly-printed product with its own dispatchDaysMin/Max
// production time (see DeliveryTimeline.tsx) — no delivery method can skip
// that, so promising same-day would be a promise this business can't keep.
// Standard vs. express only changes the COURIER TRANSIT time after
// dispatch, not the production time before it.
export const DELIVERY_METHODS: DeliveryMethod[] = ['standard', 'express'];

export interface ShippingSettings {
  freeShippingThreshold: number;
  flatShippingCharge: number;
  // Optional so existing callers/fixtures with only the two fields above
  // keep working unchanged for the (default) 'standard' method — only
  // exercised when deliveryMethod is 'express'.
  expressShippingCharge?: number;
}

// The single source of default shipping values — used when settings/shipping
// doesn't exist yet (server-side, firestore-settings.ts) and as the
// client-safe fallback the checkout page's delivery-method selector reads
// against (client code can't import firestore-settings.ts, which pulls in
// firebase-admin). Kept here, not duplicated, so the two never drift.
export const DEFAULT_SHIPPING_SETTINGS: Required<ShippingSettings> = {
  freeShippingThreshold: 150000,
  flatShippingCharge: 5000,
  expressShippingCharge: 15000,
};

export function calculateShipping(
  subtotal: number,
  settings: ShippingSettings,
  deliveryMethod: DeliveryMethod = 'standard'
): number {
  if (deliveryMethod === 'express') {
    // Express is a flat surcharge regardless of order size — free shipping
    // is standard delivery's own threshold-based reward, not a discount on
    // paying for a faster courier.
    return settings.expressShippingCharge ?? DEFAULT_SHIPPING_SETTINGS.expressShippingCharge;
  }
  return subtotal >= settings.freeShippingThreshold ? 0 : settings.flatShippingCharge;
}

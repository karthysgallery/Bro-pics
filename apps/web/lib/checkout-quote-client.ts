import type { User } from 'firebase/auth';
import type { DeliveryMethod } from '@bro-pics/shared';

export interface CheckoutQuote {
  empty: boolean;
  unavailable: Array<{ variantId: string; reason: string }>;
  lines: Array<{ variantId: string; personalizationId: string; unitPrice: number; qty: number }>;
  /** Paise. total === subtotal - discount + shipping. */
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  taxLines: Array<{ rate: number; amount: number }>;
  coupon:
    | { requested: false }
    | { requested: true; applied: true; code: string; freeShipping: boolean }
    | { requested: true; applied: false; reason: string };
}

/**
 * The server's own price summary for the signed-in user's cart (see
 * /api/checkout/quote). Resolves to null on any failure — the page then falls
 * back to its local estimate rather than breaking checkout; create-order
 * recomputes everything authoritatively either way.
 */
export async function fetchCheckoutQuote(
  user: Pick<User, 'getIdToken'>,
  params: { couponCode?: string | null; deliveryMethod: DeliveryMethod },
  signal?: AbortSignal
): Promise<CheckoutQuote | null> {
  try {
    const idToken = await user.getIdToken();
    const response = await fetch('/api/checkout/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ couponCode: params.couponCode ?? undefined, deliveryMethod: params.deliveryMethod }),
      signal,
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.empty ? null : (body as CheckoutQuote);
  } catch {
    return null;
  }
}

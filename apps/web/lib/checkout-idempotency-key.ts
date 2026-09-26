'use client';

// sessionStorage (not localStorage): scoped to this tab, and gone once the
// tab closes — a checkout attempt shouldn't outlive that the way the
// anonymous session id (session-id.ts) deliberately does.
const STORAGE_KEY = 'bropics_checkout_idempotency_key';

/**
 * One key per checkout attempt — stable across a double-click, a retried
 * request after a network blip, or the customer closing/failing the
 * Razorpay modal and clicking "Place Order" again (checkout/page.tsx's
 * handleRetryAfterFailure resets UI state but not this key). create-order
 * uses it to return the SAME order/Razorpay order on a retry instead of
 * creating a duplicate [BE-13]. Call clearCheckoutIdempotencyKey() once an
 * order actually succeeds, so the next, unrelated purchase gets a fresh key.
 */
export function getOrCreateCheckoutIdempotencyKey(): string {
  const existing = sessionStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const key = crypto.randomUUID();
  sessionStorage.setItem(STORAGE_KEY, key);
  return key;
}

export function clearCheckoutIdempotencyKey(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

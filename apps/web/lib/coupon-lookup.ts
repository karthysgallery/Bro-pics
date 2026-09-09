import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { CouponSchema, type Coupon } from '@bro-pics/shared';

/**
 * Coupon codes are their own Firestore doc id (coupons/{code}), matching
 * firestore.rules' match /coupons/{code} shape — a direct doc lookup, not
 * a queried field. firestore.rules blocks all client reads/writes on this
 * collection except staff/admin reads, so every caller of this function
 * must be an Admin SDK route.
 */
export async function findCouponByCode(db: Firestore, code: string): Promise<Coupon | null> {
  // Normalize before using the raw client-supplied string as a Firestore
  // doc-id lookup key — trim whitespace and uppercase it, matching the
  // seeded NEW10's casing convention. This is the single source of truth
  // for coupon-code normalization: callers (create-order, coupon/validate)
  // rely on this function's returned `coupon.code` (sourced from `doc.id`
  // below) as the trustworthy, normalized value rather than re-normalizing
  // the raw input themselves.
  const normalizedCode = code.trim().toUpperCase();
  const doc = await db.collection('coupons').doc(normalizedCode).get();
  if (!doc.exists) return null;
  const data = doc.data() as Record<string, unknown>;

  // Cast to an object type with optional toDate method for type narrowing
  const startsAtField = data.startsAt as { toDate?: unknown } | undefined;
  const endsAtField = data.endsAt as { toDate?: unknown } | undefined;

  // Guard against missing or malformed Timestamp fields
  if (
    !startsAtField ||
    !endsAtField ||
    typeof startsAtField.toDate !== 'function' ||
    typeof endsAtField.toDate !== 'function'
  ) {
    return null;
  }

  // A coupon doc that exists but fails schema validation (data-entry error,
  // partial write, migration remnant) is treated the same as "not found" —
  // checkout must never 500 over a malformed coupon. Only this parse call is
  // guarded, so a genuine infrastructure error (e.g. Firestore connectivity)
  // still propagates instead of being silently swallowed.
  try {
    return CouponSchema.parse({
      ...data,
      code: doc.id, // Override with doc.id, not data.code
      startsAt: (data.startsAt as Timestamp).toDate(),
      endsAt: (data.endsAt as Timestamp).toDate(),
    });
  } catch {
    return null;
  }
}

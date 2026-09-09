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
  const doc = await db.collection('coupons').doc(code).get();
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

  return CouponSchema.parse({
    ...data,
    code: doc.id, // Override with doc.id, not data.code
    startsAt: (data.startsAt as Timestamp).toDate(),
    endsAt: (data.endsAt as Timestamp).toDate(),
  });
}

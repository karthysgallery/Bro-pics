import type { Firestore, Timestamp, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { CouponSchema, type Coupon } from '@bro-pics/shared';

/**
 * Shared doc-to-Coupon parsing: guards against missing/malformed Timestamp
 * fields and schema-invalid docs (data-entry error, partial write,
 * migration remnant) by returning null rather than throwing — a caller
 * skips/treats-as-not-found rather than 500ing over one bad coupon doc.
 */
function parseCouponDoc(doc: QueryDocumentSnapshot): Coupon | null {
  const data = doc.data() as Record<string, unknown>;
  const startsAtField = data.startsAt as { toDate?: unknown } | undefined;
  const endsAtField = data.endsAt as { toDate?: unknown } | undefined;
  if (!startsAtField || !endsAtField || typeof startsAtField.toDate !== 'function' || typeof endsAtField.toDate !== 'function') {
    return null;
  }
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
  return parseCouponDoc(doc as QueryDocumentSnapshot);
}

/**
 * Every coupon doc, parsed the same way findCouponByCode parses one — used
 * by the account-facing "available coupons" listing. There's no
 * public/private visibility flag on Coupon today, so this returns every
 * coupon regardless of whether it was meant to be broadly advertised or
 * handed out through a targeted channel; the caller filters by date-window
 * validity. Documented as a gap, not silently assumed.
 */
export async function listAllCoupons(db: Firestore): Promise<Coupon[]> {
  const snapshot = await db.collection('coupons').get();
  return snapshot.docs.map(parseCouponDoc).filter((c): c is Coupon => c !== null);
}

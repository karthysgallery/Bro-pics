import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

export interface RatingFields {
  ratingAverage: number;
  ratingCount: number;
}

export function calculateRatingFields(ratings: number[]): RatingFields {
  if (ratings.length === 0) {
    return { ratingAverage: 0, ratingCount: 0 };
  }
  const sum = ratings.reduce((total, r) => total + r, 0);
  const average = Math.round((sum / ratings.length) * 10) / 10;
  return { ratingAverage: average, ratingCount: ratings.length };
}

/**
 * Thin Cloud Function glue: on any write to a review doc, re-reads every
 * approved review for that product and writes the recalculated rating
 * fields onto the parent product doc. Fires on every write (submission,
 * approval, rejection) rather than only on approval — a non-approval
 * write is a no-op recompute, but this keeps the trigger's logic uniform:
 * always derive the aggregate fresh from the approved set, never patch
 * counts incrementally. Not unit-tested directly, same reasoning as
 * onVariantWritten's docblock — a few lines of Admin SDK read/write
 * around the pure, fully-tested calculateRatingFields above.
 */
export const onReviewWritten = onDocumentWritten('reviews/{reviewId}', async (event) => {
  const after = event.data?.after?.data();
  const before = event.data?.before?.data();
  const productId = (after?.productId ?? before?.productId) as string | undefined;
  if (!productId) return;

  const db = getFirestore();
  const approvedSnapshot = await db
    .collection('reviews')
    .where('productId', '==', productId)
    .where('status', '==', 'approved')
    .get();
  const ratings = approvedSnapshot.docs.map((doc) => (doc.data() as { rating: number }).rating);

  const fields = calculateRatingFields(ratings);
  await db.collection('products').doc(productId).set(fields, { merge: true });
});

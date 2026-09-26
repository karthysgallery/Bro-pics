import type { Firestore } from 'firebase-admin/firestore';
import { eligibleSubtotalForCoupon, type Coupon, type CouponEligibleLine } from '@bro-pics/shared';
import type { PricedCartLine } from './checkout-calc';

/**
 * [BE-24] Turns priced cart lines into the subtotal a coupon's appliesTo
 * scope actually covers — pass this result to calculateCouponDiscount in
 * place of the order's full subtotal. Only fetches Product docs (for
 * categoryId) when the coupon is actually category-scoped; a 'product'
 * or 'all' coupon needs no extra Firestore reads.
 */
export async function computeEligibleSubtotal(db: Firestore, priced: PricedCartLine[], coupon: Coupon): Promise<number> {
  const needsCategory = coupon.appliesTo === 'category';
  const categoryIdByProductId = new Map<string, string>();

  if (needsCategory) {
    const uniqueProductIds = [...new Set(priced.map((line) => line.productId))];
    const productDocs = await Promise.all(uniqueProductIds.map((productId) => db.collection('products').doc(productId).get()));
    for (const doc of productDocs) {
      if (!doc.exists) continue;
      const categoryId = (doc.data() as { categoryId?: string }).categoryId;
      if (typeof categoryId === 'string') categoryIdByProductId.set(doc.id, categoryId);
    }
  }

  const lines: CouponEligibleLine[] = priced.map((line) => ({
    productId: line.productId,
    ...(needsCategory && { categoryId: categoryIdByProductId.get(line.productId) }),
    lineTotalPaise: line.unitPrice * line.qty,
  }));

  return eligibleSubtotalForCoupon(lines, coupon);
}

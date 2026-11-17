import type { Coupon } from '../schemas/coupon';

export interface CouponEligibleLine {
  productId: string;
  // Undefined when the caller didn't need to resolve it (e.g. the coupon
  // isn't category-scoped) — never treated as "matches everything".
  categoryId?: string;
  lineTotalPaise: number;
  /** The product opts out of discount codes (see Product.couponsExcluded). */
  couponsExcluded?: boolean;
}

/**
 * [BE-24] Sums only the cart lines a coupon's appliesTo scope actually
 * covers — the number this returns is what should be passed as
 * calculateCouponDiscount's subtotalPaise argument, in place of the
 * order's full subtotal, whenever appliesTo isn't 'all'. Kept as a
 * separate function (not folded into calculateCouponDiscount itself) so
 * that function's existing signature and tests stay untouched — every
 * caller already knows how to turn "the right subtotal number" into a
 * discount; this only changes what that number is.
 */
export function eligibleSubtotalForCoupon(allLines: CouponEligibleLine[], coupon: Coupon): number {
  // An offer product keeps its offer price: only a coupon made for that exact product can discount it.
  const named = new Set(coupon.appliesTo === 'product' ? (coupon.productIds ?? []) : []);
  const lines = allLines.filter((line) => !line.couponsExcluded || named.has(line.productId));
  if (coupon.appliesTo === 'all') {
    return lines.reduce((sum, line) => sum + line.lineTotalPaise, 0);
  }
  if (coupon.appliesTo === 'product') {
    const ids = new Set(coupon.productIds ?? []);
    return lines.filter((line) => ids.has(line.productId)).reduce((sum, line) => sum + line.lineTotalPaise, 0);
  }
  // 'category'
  const ids = new Set(coupon.categoryIds ?? []);
  return lines
    .filter((line) => line.categoryId !== undefined && ids.has(line.categoryId))
    .reduce((sum, line) => sum + line.lineTotalPaise, 0);
}

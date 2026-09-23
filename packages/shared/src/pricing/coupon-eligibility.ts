import type { Coupon } from '../schemas/coupon';

export interface CouponEligibleLine {
  productId: string;
  // Undefined when the caller didn't need to resolve it (e.g. the coupon
  // isn't category-scoped) — never treated as "matches everything".
  categoryId?: string;
  lineTotalPaise: number;
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
export function eligibleSubtotalForCoupon(lines: CouponEligibleLine[], coupon: Coupon): number {
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

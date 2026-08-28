import type { Coupon } from '../schemas/coupon';
import { assertPaise } from './money';

export interface CouponApplicationResult {
  valid: boolean;
  discountPaise: number;
  reason?: 'below_min_order' | 'expired' | 'not_started' | 'usage_limit_reached';
}

export function calculateCouponDiscount(
  subtotalPaise: number,
  coupon: Coupon,
  now: Date = new Date()
): CouponApplicationResult {
  assertPaise(subtotalPaise, 'subtotalPaise');

  if (now < coupon.startsAt) {
    return { valid: false, discountPaise: 0, reason: 'not_started' };
  }
  if (now > coupon.endsAt) {
    return { valid: false, discountPaise: 0, reason: 'expired' };
  }
  if (coupon.minOrder !== undefined && subtotalPaise < coupon.minOrder) {
    return { valid: false, discountPaise: 0, reason: 'below_min_order' };
  }
  if (coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit) {
    return { valid: false, discountPaise: 0, reason: 'usage_limit_reached' };
  }

  let discountPaise: number;
  if (coupon.type === 'flat') {
    discountPaise = coupon.value;
  } else if (coupon.type === 'percent') {
    discountPaise = Math.round((subtotalPaise * coupon.value) / 100);
  } else {
    discountPaise = 0; // free_ship discount is applied to shipping, not subtotal
  }

  if (coupon.maxDiscountCap !== undefined) {
    discountPaise = Math.min(discountPaise, coupon.maxDiscountCap);
  }
  discountPaise = Math.min(discountPaise, subtotalPaise);

  return { valid: true, discountPaise };
}

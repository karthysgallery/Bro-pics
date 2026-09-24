import { describe, it, expect } from 'vitest';
import { calculateCouponDiscount } from './coupon';
import type { Coupon } from '../schemas/coupon';

function makeCoupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    code: 'SAVE10',
    type: 'percent',
    value: 10,
    startsAt: new Date('2026-01-01'),
    endsAt: new Date('2026-12-31'),
    appliesTo: 'all',
    usedCount: 0,
    ...overrides,
  };
}

describe('calculateCouponDiscount', () => {
  it('calculates a percent discount', () => {
    const result = calculateCouponDiscount(100000, makeCoupon({ type: 'percent', value: 10 }));
    expect(result).toEqual({ valid: true, discountPaise: 10000 });
  });

  it('calculates a flat discount', () => {
    const result = calculateCouponDiscount(100000, makeCoupon({ type: 'flat', value: 5000 }));
    expect(result).toEqual({ valid: true, discountPaise: 5000 });
  });

  it('caps a percent discount at maxDiscountCap', () => {
    const result = calculateCouponDiscount(
      1000000,
      makeCoupon({ type: 'percent', value: 50, maxDiscountCap: 20000 })
    );
    expect(result).toEqual({ valid: true, discountPaise: 20000 });
  });

  it('rejects when subtotal is below minOrder', () => {
    const result = calculateCouponDiscount(1000, makeCoupon({ minOrder: 5000 }));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('below_min_order');
  });

  it('rejects when the coupon has expired', () => {
    const result = calculateCouponDiscount(
      100000,
      makeCoupon({ endsAt: new Date('2020-01-01') }),
      new Date('2026-06-01')
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('rejects when the coupon has not started yet', () => {
    const result = calculateCouponDiscount(
      100000,
      makeCoupon({ startsAt: new Date('2027-01-01') }),
      new Date('2026-06-01')
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_started');
  });

  it('rejects when usageLimit has been reached', () => {
    const result = calculateCouponDiscount(
      100000,
      makeCoupon({ usageLimit: 10, usedCount: 10 })
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('usage_limit_reached');
  });

  it('never returns a discount greater than the subtotal', () => {
    const result = calculateCouponDiscount(1000, makeCoupon({ type: 'flat', value: 5000 }));
    expect(result.discountPaise).toBe(1000);
  });

  it('[ABE-21] rejects when isActive is explicitly false', () => {
    const result = calculateCouponDiscount(100000, makeCoupon({ isActive: false }));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('inactive');
  });

  it('[ABE-21] accepts when isActive is true or absent', () => {
    expect(calculateCouponDiscount(100000, makeCoupon({ isActive: true })).valid).toBe(true);
    expect(calculateCouponDiscount(100000, makeCoupon()).valid).toBe(true);
  });

  it('[ABE-21] rejects a coupon assigned to a different user', () => {
    const result = calculateCouponDiscount(100000, makeCoupon({ assignedUserId: 'user_1' }), new Date(), 'user_2');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_assigned_to_you');
  });

  it('[ABE-21] rejects an assigned coupon when no userId is given', () => {
    const result = calculateCouponDiscount(100000, makeCoupon({ assignedUserId: 'user_1' }));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_assigned_to_you');
  });

  it('[ABE-21] accepts an assigned coupon for the matching user', () => {
    const result = calculateCouponDiscount(100000, makeCoupon({ assignedUserId: 'user_1' }), new Date(), 'user_1');
    expect(result.valid).toBe(true);
  });

  it('[ABE-21] accepts an unassigned coupon for any user', () => {
    const result = calculateCouponDiscount(100000, makeCoupon({ assignedUserId: null }), new Date(), 'user_2');
    expect(result.valid).toBe(true);
  });
});

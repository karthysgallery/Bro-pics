import { describe, it, expect } from 'vitest';
import { eligibleSubtotalForCoupon, type CouponEligibleLine } from './coupon-eligibility';
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

const LINES: CouponEligibleLine[] = [
  { productId: 'p1', categoryId: 'c1', lineTotalPaise: 10000 },
  { productId: 'p2', categoryId: 'c2', lineTotalPaise: 20000 },
  { productId: 'p3', categoryId: 'c1', lineTotalPaise: 30000 },
];

describe('eligibleSubtotalForCoupon', () => {
  it("sums every line when appliesTo is 'all'", () => {
    expect(eligibleSubtotalForCoupon(LINES, makeCoupon({ appliesTo: 'all' }))).toBe(60000);
  });

  it("sums only lines whose productId is in productIds when appliesTo is 'product'", () => {
    const coupon = makeCoupon({ appliesTo: 'product', productIds: ['p1', 'p3'] });
    expect(eligibleSubtotalForCoupon(LINES, coupon)).toBe(40000);
  });

  it("sums only lines whose categoryId is in categoryIds when appliesTo is 'category'", () => {
    const coupon = makeCoupon({ appliesTo: 'category', categoryIds: ['c1'] });
    expect(eligibleSubtotalForCoupon(LINES, coupon)).toBe(40000);
  });

  it('returns 0 when nothing in the cart matches a product/category-scoped coupon', () => {
    expect(eligibleSubtotalForCoupon(LINES, makeCoupon({ appliesTo: 'product', productIds: ['p9'] }))).toBe(0);
    expect(eligibleSubtotalForCoupon(LINES, makeCoupon({ appliesTo: 'category', categoryIds: ['c9'] }))).toBe(0);
  });

  it('returns 0 for a product/category-scoped coupon with no ids configured, rather than matching everything', () => {
    expect(eligibleSubtotalForCoupon(LINES, makeCoupon({ appliesTo: 'product' }))).toBe(0);
    expect(eligibleSubtotalForCoupon(LINES, makeCoupon({ appliesTo: 'category' }))).toBe(0);
  });

  it('never treats a line with an unresolved categoryId as a match', () => {
    const linesWithoutCategory: CouponEligibleLine[] = [{ productId: 'p1', lineTotalPaise: 10000 }];
    expect(eligibleSubtotalForCoupon(linesWithoutCategory, makeCoupon({ appliesTo: 'category', categoryIds: ['c1'] }))).toBe(0);
  });
});

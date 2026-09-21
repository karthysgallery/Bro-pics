import { describe, it, expect } from 'vitest';
import { OrderSchema } from './order';

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order_1',
    orderNo: 'BP-2026-00001',
    userId: 'user_1',
    status: 'pending_payment',
    paymentStatus: 'pending',
    subtotal: 100000,
    discount: 0,
    shipping: 5000,
    total: 105000,
    addressJson: { line1: '12 MG Road', city: 'Chennai' },
    placedAt: new Date('2026-09-04T00:00:00.000Z'),
    paymentMode: 'prepaid',
    amountPaidOnline: 105000,
    amountDueOnDelivery: 0,
    taxLines: [],
    ...overrides,
  };
}

describe('OrderSchema money invariants', () => {
  it('accepts an order whose totals are internally consistent', () => {
    expect(OrderSchema.safeParse(baseOrder()).success).toBe(true);
  });

  it('rejects when subtotal - discount + shipping does not equal total', () => {
    const result = OrderSchema.safeParse(baseOrder({ total: 999999 }));
    expect(result.success).toBe(false);
  });

  it('rejects when amountPaidOnline + amountDueOnDelivery does not equal total', () => {
    const result = OrderSchema.safeParse(baseOrder({ amountPaidOnline: 1, amountDueOnDelivery: 1 }));
    expect(result.success).toBe(false);
  });

  it('accepts a discounted order whose totals still add up', () => {
    const result = OrderSchema.safeParse(
      baseOrder({ subtotal: 100000, discount: 10000, shipping: 5000, total: 95000, amountPaidOnline: 95000 })
    );
    expect(result.success).toBe(true);
  });
});

describe('OrderSchema deliveryMethod', () => {
  it('accepts an order with no deliveryMethod set (pre-existing orders)', () => {
    expect(OrderSchema.safeParse(baseOrder()).success).toBe(true);
  });

  it('accepts "standard" and "express"', () => {
    expect(OrderSchema.safeParse(baseOrder({ deliveryMethod: 'standard' })).success).toBe(true);
    expect(OrderSchema.safeParse(baseOrder({ deliveryMethod: 'express' })).success).toBe(true);
  });

  it('rejects an unsupported delivery method (same-day is deliberately not offered)', () => {
    expect(OrderSchema.safeParse(baseOrder({ deliveryMethod: 'same_day' })).success).toBe(false);
  });
});

describe('OrderSchema courier/awbNumber', () => {
  it('accepts an order with courier and awbNumber set', () => {
    const result = OrderSchema.safeParse(baseOrder({ courier: 'BlueDart', awbNumber: 'BD123456789' }));
    expect(result.success).toBe(true);
  });

  it('accepts an order with neither field set (pre-shipping)', () => {
    expect(OrderSchema.safeParse(baseOrder()).success).toBe(true);
  });
});

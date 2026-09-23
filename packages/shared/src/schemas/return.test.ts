import { describe, it, expect } from 'vitest';
import { ReturnSchema } from './return';

function baseReturn(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ret_1',
    orderId: 'order_1',
    userId: 'user_1',
    reasonCategory: 'damaged',
    reason: 'Frame arrived damaged',
    status: 'requested',
    requestedAt: '2026-09-20T00:00:00.000Z',
    resolvedAt: null,
    refundAmount: 105000,
    ...overrides,
  };
}

describe('ReturnSchema', () => {
  it('accepts a freshly requested return', () => {
    expect(ReturnSchema.safeParse(baseReturn()).success).toBe(true);
  });

  it('accepts every status in the lifecycle', () => {
    for (const status of ['requested', 'approved', 'rejected', 'pickup_scheduled', 'picked_up', 'refund_processing', 'refunded']) {
      expect(ReturnSchema.safeParse(baseReturn({ status })).success).toBe(true);
    }
  });

  it('rejects an unknown status', () => {
    expect(ReturnSchema.safeParse(baseReturn({ status: 'shipped' })).success).toBe(false);
  });

  it('rejects a blank reason', () => {
    expect(ReturnSchema.safeParse(baseReturn({ reason: '' })).success).toBe(false);
  });

  it('accepts an approved return with a razorpayRefundId and staffNote', () => {
    const result = ReturnSchema.safeParse(
      baseReturn({ status: 'refunded', resolvedAt: '2026-09-25T00:00:00.000Z', razorpayRefundId: 'rfnd_1', staffNote: 'Approved, inspected on pickup' })
    );
    expect(result.success).toBe(true);
  });

  it('[BE-19] accepts every reason category', () => {
    for (const reasonCategory of ['damaged', 'wrong_item', 'quality', 'changed_mind', 'other']) {
      expect(ReturnSchema.safeParse(baseReturn({ reasonCategory })).success).toBe(true);
    }
  });

  it('[BE-19] rejects an unknown reason category', () => {
    expect(ReturnSchema.safeParse(baseReturn({ reasonCategory: 'not_a_category' })).success).toBe(false);
  });

  it('[BE-19] requires a reasonCategory', () => {
    const { reasonCategory: _omit, ...withoutCategory } = baseReturn();
    expect(ReturnSchema.safeParse(withoutCategory).success).toBe(false);
  });

  it('[BE-19] accepts evidencePaths as Storage object paths, and omits fine too', () => {
    expect(ReturnSchema.safeParse(baseReturn({ evidencePaths: ['returns/ret_1/photo1.jpg'] })).success).toBe(true);
    expect(ReturnSchema.safeParse(baseReturn()).success).toBe(true);
  });
});

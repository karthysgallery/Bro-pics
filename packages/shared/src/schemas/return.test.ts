import { describe, it, expect } from 'vitest';
import { ReturnSchema } from './return';

function baseReturn(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ret_1',
    orderId: 'order_1',
    userId: 'user_1',
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
});

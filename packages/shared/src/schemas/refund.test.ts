import { describe, it, expect } from 'vitest';
import { RefundSchema } from './refund';

const validRefund = {
  id: 'refund_1',
  orderId: 'order_1',
  amount: 105000,
  reason: null,
  status: 'pending' as const,
  razorpayRefundId: null,
  returnId: null,
  createdAt: new Date('2026-09-01'),
  createdBy: 'staff_1',
  processedAt: null,
  failureReason: null,
};

describe('RefundSchema', () => {
  it('accepts a pending refund with no Razorpay id yet', () => {
    expect(RefundSchema.parse(validRefund)).toEqual(validRefund);
  });

  it('accepts a processed refund linked to a return', () => {
    const processed = {
      ...validRefund,
      status: 'processed' as const,
      razorpayRefundId: 'rfnd_1',
      returnId: 'ret_1',
      processedAt: new Date('2026-09-02'),
    };
    expect(RefundSchema.parse(processed)).toEqual(processed);
  });

  it('accepts a system-proposed refund with no createdBy', () => {
    const proposed = { ...validRefund, createdBy: null };
    expect(RefundSchema.parse(proposed)).toEqual(proposed);
  });

  it('accepts a failed refund with a failureReason', () => {
    const failed = { ...validRefund, status: 'failed' as const, failureReason: 'Payment already fully refunded' };
    expect(RefundSchema.parse(failed)).toEqual(failed);
  });

  it('rejects a non-positive amount', () => {
    expect(() => RefundSchema.parse({ ...validRefund, amount: 0 })).toThrow();
  });

  it('rejects an unknown status', () => {
    expect(() => RefundSchema.parse({ ...validRefund, status: 'refunded' })).toThrow();
  });
});

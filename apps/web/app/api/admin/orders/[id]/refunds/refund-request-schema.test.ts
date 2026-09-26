import { describe, it, expect } from 'vitest';
import { CreateRefundBodySchema } from './refund-request-schema';

describe('CreateRefundBodySchema', () => {
  it('accepts an empty body (full remaining refund)', () => {
    expect(CreateRefundBodySchema.parse({})).toEqual({});
  });

  it('accepts an amount and reason', () => {
    expect(CreateRefundBodySchema.parse({ amount: 5000, reason: 'Goodwill gesture' })).toEqual({ amount: 5000, reason: 'Goodwill gesture' });
  });

  it('accepts a refundId to process an existing proposal', () => {
    expect(CreateRefundBodySchema.parse({ refundId: 'refund_1' })).toEqual({ refundId: 'refund_1' });
  });

  it('rejects a non-positive amount', () => {
    expect(CreateRefundBodySchema.safeParse({ amount: 0 }).success).toBe(false);
  });

  it('rejects an unknown field', () => {
    expect(CreateRefundBodySchema.safeParse({ notAField: 1 }).success).toBe(false);
  });
});

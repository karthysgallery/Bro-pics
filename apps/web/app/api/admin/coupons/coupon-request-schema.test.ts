import { describe, it, expect } from 'vitest';
import { CreateCouponBodySchema, UpdateCouponBodySchema, AssignCouponBodySchema } from './coupon-request-schema';

const validBody = {
  code: 'SAVE10',
  type: 'percent' as const,
  value: 10,
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: '2026-12-31T00:00:00.000Z',
  appliesTo: 'all' as const,
};

describe('CreateCouponBodySchema', () => {
  it('accepts a minimal body and fills in isActive default', () => {
    const result = CreateCouponBodySchema.parse(validBody);
    expect(result).toMatchObject({ code: 'SAVE10', type: 'percent', value: 10, isActive: true });
  });

  it('rejects an unknown field', () => {
    expect(CreateCouponBodySchema.safeParse({ ...validBody, notAField: 1 }).success).toBe(false);
  });

  it('rejects usedCount as an input field', () => {
    expect(CreateCouponBodySchema.safeParse({ ...validBody, usedCount: 100 }).success).toBe(false);
  });

  it('rejects an unknown coupon type', () => {
    expect(CreateCouponBodySchema.safeParse({ ...validBody, type: 'bogo' }).success).toBe(false);
  });

  it('rejects a missing code', () => {
    const { code: _code, ...rest } = validBody;
    expect(CreateCouponBodySchema.safeParse(rest).success).toBe(false);
  });
});

describe('UpdateCouponBodySchema', () => {
  it('accepts a partial body without code', () => {
    expect(UpdateCouponBodySchema.parse({ isActive: false })).toEqual({ isActive: false });
  });

  it('rejects code as a field (immutable, the doc id)', () => {
    expect(UpdateCouponBodySchema.safeParse({ code: 'NEWCODE' }).success).toBe(false);
  });

  it('rejects usedCount as a field', () => {
    expect(UpdateCouponBodySchema.safeParse({ usedCount: 5 }).success).toBe(false);
  });
});

describe('AssignCouponBodySchema', () => {
  it('accepts a userId', () => {
    expect(AssignCouponBodySchema.parse({ userId: 'user_1' })).toEqual({ userId: 'user_1' });
  });

  it('accepts null to unassign', () => {
    expect(AssignCouponBodySchema.parse({ userId: null })).toEqual({ userId: null });
  });

  it('rejects a missing userId field', () => {
    expect(AssignCouponBodySchema.safeParse({}).success).toBe(false);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { findCouponByCode } from './coupon-lookup';

function makeFakeDb(exists: boolean, data?: Record<string, unknown>) {
  const get = vi.fn().mockResolvedValue({ exists, data: () => data });
  return {
    db: { collection: vi.fn(() => ({ doc: vi.fn(() => ({ get })) })) },
    get,
  };
}

describe('findCouponByCode', () => {
  it('returns the parsed coupon, converting Timestamp fields to Date, when the doc exists', async () => {
    const { db } = makeFakeDb(true, {
      code: 'NEW10',
      type: 'percent',
      value: 10,
      startsAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z')),
      endsAt: Timestamp.fromDate(new Date('2027-01-01T00:00:00.000Z')),
      appliesTo: 'all',
      usedCount: 0,
    });
    const result = await findCouponByCode(db as never, 'NEW10');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('NEW10');
    expect(result?.startsAt).toBeInstanceOf(Date);
    expect(result?.endsAt).toBeInstanceOf(Date);
  });

  it('returns null when the doc does not exist', async () => {
    const { db } = makeFakeDb(false);
    const result = await findCouponByCode(db as never, 'UNKNOWN');
    expect(result).toBeNull();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { findCouponByCode } from './coupon-lookup';

function makeFakeDb(exists: boolean, data?: Record<string, unknown>, docId?: string) {
  const get = vi.fn().mockResolvedValue({ exists, data: () => data, id: docId });
  const collection = vi.fn();
  const doc = vi.fn();
  collection.mockReturnValue({ doc });
  doc.mockReturnValue({ get, id: docId });
  return {
    db: { collection },
    collection,
    doc,
    get,
  };
}

describe('findCouponByCode', () => {
  it('returns the parsed coupon, converting Timestamp fields to Date, when the doc exists', async () => {
    const { db, collection, doc } = makeFakeDb(true, {
      code: 'NEW10',
      type: 'percent',
      value: 10,
      startsAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z')),
      endsAt: Timestamp.fromDate(new Date('2027-01-01T00:00:00.000Z')),
      appliesTo: 'all',
      usedCount: 0,
    }, 'NEW10');
    const result = await findCouponByCode(db as never, 'NEW10');
    expect(collection).toHaveBeenCalledWith('coupons');
    expect(doc).toHaveBeenCalledWith('NEW10');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('NEW10');
    expect(result?.startsAt).toBeInstanceOf(Date);
    expect(result?.endsAt).toBeInstanceOf(Date);
  });

  it('returns null when the doc does not exist', async () => {
    const { db, collection, doc } = makeFakeDb(false, undefined, 'UNKNOWN');
    const result = await findCouponByCode(db as never, 'UNKNOWN');
    expect(collection).toHaveBeenCalledWith('coupons');
    expect(doc).toHaveBeenCalledWith('UNKNOWN');
    expect(result).toBeNull();
  });
});

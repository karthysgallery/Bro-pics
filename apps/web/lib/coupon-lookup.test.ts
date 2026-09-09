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

  it('normalizes a lowercase or whitespace-padded code to the same coupon doc', async () => {
    const { db, collection, doc } = makeFakeDb(true, {
      code: 'NEW10',
      type: 'percent',
      value: 10,
      startsAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z')),
      endsAt: Timestamp.fromDate(new Date('2027-01-01T00:00:00.000Z')),
      appliesTo: 'all',
      usedCount: 0,
    }, 'NEW10');
    const result = await findCouponByCode(db as never, '  new10  ');
    expect(collection).toHaveBeenCalledWith('coupons');
    expect(doc).toHaveBeenCalledWith('NEW10');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('NEW10');
  });

  it('returns null when the doc does not exist', async () => {
    const { db, collection, doc } = makeFakeDb(false, undefined, 'UNKNOWN');
    const result = await findCouponByCode(db as never, 'UNKNOWN');
    expect(collection).toHaveBeenCalledWith('coupons');
    expect(doc).toHaveBeenCalledWith('UNKNOWN');
    expect(result).toBeNull();
  });

  it('returns null when the doc exists but is missing startsAt field', async () => {
    const { db, collection, doc } = makeFakeDb(true, {
      code: 'INCOMPLETE1',
      type: 'percent',
      value: 10,
      // startsAt is missing
      endsAt: Timestamp.fromDate(new Date('2027-01-01T00:00:00.000Z')),
      appliesTo: 'all',
      usedCount: 0,
    }, 'INCOMPLETE1');
    const result = await findCouponByCode(db as never, 'INCOMPLETE1');
    expect(result).toBeNull();
  });

  it('returns null when startsAt is a malformed value (not a Timestamp)', async () => {
    const { db, collection, doc } = makeFakeDb(true, {
      code: 'MALFORMED1',
      type: 'percent',
      value: 10,
      startsAt: '2026-01-01T00:00:00.000Z', // String instead of Timestamp
      endsAt: Timestamp.fromDate(new Date('2027-01-01T00:00:00.000Z')),
      appliesTo: 'all',
      usedCount: 0,
    }, 'MALFORMED1');
    const result = await findCouponByCode(db as never, 'MALFORMED1');
    expect(result).toBeNull();
  });

  it('returns null instead of throwing when the doc exists with valid Timestamps but an invalid type field', async () => {
    const { db, collection, doc, get } = makeFakeDb(true, {
      code: 'BADTYPE1',
      type: 'not_a_real_type', // Not one of 'percent' | 'flat' | 'free_ship'
      value: 10,
      startsAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z')),
      endsAt: Timestamp.fromDate(new Date('2027-01-01T00:00:00.000Z')),
      appliesTo: 'all',
      usedCount: 0,
    }, 'BADTYPE1');
    await expect(findCouponByCode(db as never, 'BADTYPE1')).resolves.toBeNull();
    expect(get).toHaveBeenCalled();
    expect(collection).toHaveBeenCalledWith('coupons');
    expect(doc).toHaveBeenCalledWith('BADTYPE1');
  });
});

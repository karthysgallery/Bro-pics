import { describe, it, expect } from 'vitest';
import { CreateBannerBodySchema, UpdateBannerBodySchema, ReorderBannersBodySchema } from './banner-request-schema';

describe('CreateBannerBodySchema', () => {
  it('accepts a minimal body and fills in defaults', () => {
    const result = CreateBannerBodySchema.parse({ title: 'Diwali Sale' });
    expect(result).toMatchObject({ title: 'Diwali Sale', subtitle: '', couponCode: null, startsAt: null, endsAt: null, isActive: true, sortOrder: 0 });
  });

  it('rejects an unknown field', () => {
    expect(CreateBannerBodySchema.safeParse({ title: 'x', notAField: 1 }).success).toBe(false);
  });

  it('transforms ISO datetime strings into Dates', () => {
    const result = CreateBannerBodySchema.parse({ title: 'x', startsAt: '2026-10-01T00:00:00.000Z' });
    expect(result.startsAt).toEqual(new Date('2026-10-01T00:00:00.000Z'));
  });
});

describe('UpdateBannerBodySchema', () => {
  it('accepts a partial body', () => {
    expect(UpdateBannerBodySchema.parse({ isActive: false })).toEqual({ isActive: false });
  });
});

describe('ReorderBannersBodySchema', () => {
  it('rejects an empty array', () => {
    expect(ReorderBannersBodySchema.safeParse({ orderedIds: [] }).success).toBe(false);
  });
});

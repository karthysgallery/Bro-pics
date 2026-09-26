import { describe, it, expect } from 'vitest';
import { CreateProductBodySchema, UpdateProductBodySchema } from './product-request-schema';

const validCreateBody = {
  title: 'Classic Frame',
  slug: 'classic-frame',
  categoryId: 'cat_1',
  shortDesc: 'A classic frame',
  basePrice: 99900,
};

describe('CreateProductBodySchema', () => {
  it('accepts a minimal valid body and fills in defaults', () => {
    const result = CreateProductBodySchema.parse(validCreateBody);
    expect(result.status).toBe('draft');
    expect(result.isFeatured).toBe(false);
    expect(result.photoSlots).toBe(1);
    expect(result.relatedProductIds).toEqual([]);
  });

  it('[ABE-03/04] rejects an unknown field', () => {
    const result = CreateProductBodySchema.safeParse({ ...validCreateBody, notAField: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects a denormalized, Cloud-Function-owned field being set directly', () => {
    const result = CreateProductBodySchema.safeParse({ ...validCreateBody, minPrice: 100, ratingAverage: 5 });
    expect(result.success).toBe(false);
  });

  it('rejects isActive being set directly (derived from status, not client-settable)', () => {
    const result = CreateProductBodySchema.safeParse({ ...validCreateBody, isActive: true });
    expect(result.success).toBe(false);
  });

  it('rejects more than 8 relatedProductIds', () => {
    const result = CreateProductBodySchema.safeParse({
      ...validCreateBody,
      relatedProductIds: Array.from({ length: 9 }, (_, i) => `prod_${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing required field', () => {
    const { title: _title, ...withoutTitle } = validCreateBody;
    const result = CreateProductBodySchema.safeParse(withoutTitle);
    expect(result.success).toBe(false);
  });
});

describe('UpdateProductBodySchema', () => {
  it('accepts an empty object (no fields changed)', () => {
    expect(UpdateProductBodySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a partial update with just one field', () => {
    const result = UpdateProductBodySchema.safeParse({ status: 'archived' });
    expect(result.success).toBe(true);
  });

  it('[ABE-03] still rejects an unknown field on partial() — strict() survives partial()', () => {
    const result = UpdateProductBodySchema.safeParse({ status: 'archived', notAField: 'x' });
    expect(result.success).toBe(false);
  });

  it('still rejects isActive on a partial update', () => {
    const result = UpdateProductBodySchema.safeParse({ isActive: false });
    expect(result.success).toBe(false);
  });
});

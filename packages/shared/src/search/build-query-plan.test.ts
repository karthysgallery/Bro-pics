import { describe, it, expect } from 'vitest';
import { buildProductQueryPlan } from './build-query-plan';

describe('buildProductQueryPlan', () => {
  it('always includes an isActive equality constraint', () => {
    const plan = buildProductQueryPlan('', {}, 1);
    expect(plan.constraints).toContainEqual({ field: 'isActive', op: '==', value: true });
  });

  it('includes a categoryId equality constraint when provided', () => {
    const plan = buildProductQueryPlan('', { categoryId: 'cat_frames' }, 1);
    expect(plan.constraints).toContainEqual({ field: 'categoryId', op: '==', value: 'cat_frames' });
  });

  it('includes inStock equality only when inStockOnly is true', () => {
    const withFilter = buildProductQueryPlan('', { inStockOnly: true }, 1);
    expect(withFilter.constraints).toContainEqual({ field: 'inStock', op: '==', value: true });

    const without = buildProductQueryPlan('', {}, 1);
    expect(without.constraints).not.toContainEqual({ field: 'inStock', op: '==', value: true });
  });

  it('includes minPrice/maxPrice range constraints as an overlap check', () => {
    const plan = buildProductQueryPlan('', { minPrice: 50000, maxPrice: 100000 }, 1);
    expect(plan.constraints).toContainEqual({ field: 'maxPrice', op: '>=', value: 50000 });
    expect(plan.constraints).toContainEqual({ field: 'minPrice', op: '<=', value: 100000 });
  });

  it('applies sizes as the single native array-contains-any constraint', () => {
    const plan = buildProductQueryPlan('', { sizes: ['8x12 in', '12x18 in'] }, 1);
    expect(plan.constraints).toContainEqual({
      field: 'availableSizes',
      op: 'array-contains-any',
      value: ['8x12 in', '12x18 in'],
    });
  });

  it('moves colour and material filters to postFilters when sizes is also set', () => {
    const plan = buildProductQueryPlan(
      '',
      { sizes: ['8x12 in'], colours: ['Black'], materials: ['Wood'] },
      1
    );
    expect(plan.constraints.some((c) => c.field === 'availableColours')).toBe(false);
    expect(plan.constraints.some((c) => c.field === 'availableMaterials')).toBe(false);
    expect(plan.postFilters).toContainEqual({ field: 'availableColours', anyOf: ['Black'] });
    expect(plan.postFilters).toContainEqual({ field: 'availableMaterials', anyOf: ['Wood'] });
  });

  it('uses colours as the native constraint when sizes is not set', () => {
    const plan = buildProductQueryPlan('', { colours: ['Black'] }, 1);
    expect(plan.constraints).toContainEqual({
      field: 'availableColours',
      op: 'array-contains-any',
      value: ['Black'],
    });
  });

  it('applies minRating as a postFilter, not a native constraint', () => {
    const plan = buildProductQueryPlan('', { minRating: 4 }, 1);
    expect(plan.constraints.some((c) => c.field === 'ratingAverage')).toBe(false);
    expect(plan.postFilters).toContainEqual({ field: 'ratingAverage', gte: 4 });
  });

  it('maps sort values to orderByField/orderByDirection', () => {
    expect(buildProductQueryPlan('', { sort: 'price_asc' }, 1)).toMatchObject({
      orderByField: 'minPrice',
      orderByDirection: 'asc',
    });
    expect(buildProductQueryPlan('', { sort: 'price_desc' }, 1)).toMatchObject({
      orderByField: 'minPrice',
      orderByDirection: 'desc',
    });
    expect(buildProductQueryPlan('', { sort: 'newest' }, 1)).toMatchObject({
      orderByField: 'createdAt',
      orderByDirection: 'desc',
    });
    expect(buildProductQueryPlan('', { sort: 'top_rated' }, 1)).toMatchObject({
      orderByField: 'ratingAverage',
      orderByDirection: 'desc',
    });
    expect(buildProductQueryPlan('', {}, 1)).toMatchObject({
      orderByField: 'createdAt',
      orderByDirection: 'desc',
    });
  });

  it('computes limit and offset from the page number at a fixed page size of 20', () => {
    expect(buildProductQueryPlan('', {}, 1)).toMatchObject({ limit: 20, offset: 0 });
    expect(buildProductQueryPlan('', {}, 2)).toMatchObject({ limit: 20, offset: 20 });
    expect(buildProductQueryPlan('', {}, 3)).toMatchObject({ limit: 20, offset: 40 });
  });

  it('adds a titleLower prefix range when a text query is given', () => {
    const plan = buildProductQueryPlan('Classic', {}, 1);
    expect(plan.constraints).toContainEqual({ field: 'titleLower', op: '>=', value: 'classic' });
    expect(plan.constraints).toContainEqual({
      field: 'titleLower',
      op: '<=',
      value: `classic`,
    });
  });

  it('omits the titleLower range when the query is empty', () => {
    const plan = buildProductQueryPlan('', {}, 1);
    expect(plan.constraints.some((c) => c.field === 'titleLower')).toBe(false);
  });

  it('forces orderByField to titleLower for a text query even when a different sort is requested', () => {
    const plan = buildProductQueryPlan('Classic', { sort: 'newest' }, 1);
    expect(plan.orderByField).toBe('titleLower');
    expect(plan.orderByDirection).toBe('asc');
  });

  it('forces orderByField to minPrice for a price-range filter with no sort requested', () => {
    const plan = buildProductQueryPlan('', { minPrice: 50000, maxPrice: 100000 }, 1);
    expect(plan.orderByField).toBe('minPrice');
    expect(plan.orderByDirection).toBe('asc');
  });

  it('keeps price sort direction when a price-range filter is combined with a price sort', () => {
    const plan = buildProductQueryPlan('', { minPrice: 50000, sort: 'price_desc' }, 1);
    expect(plan.orderByField).toBe('minPrice');
    expect(plan.orderByDirection).toBe('desc');
  });

  it('text query still wins orderByField over a simultaneous price-range filter', () => {
    const plan = buildProductQueryPlan('Classic', { minPrice: 50000 }, 1);
    expect(plan.orderByField).toBe('titleLower');
  });
});

import { describe, it, expect } from 'vitest';
import { parseSearchFilters } from './parse-search-params';

describe('parseSearchFilters', () => {
  it('parses a valid full filter set', () => {
    const params = new URLSearchParams(
      'size=8x12+in&colour=Black&material=Wood&occasion=Wedding&minPrice=50000&maxPrice=150000&minRating=4&inStockOnly=true&sort=price_asc&page=2'
    );
    const { filters, page } = parseSearchFilters(params);
    expect(filters).toEqual({
      sizes: ['8x12 in'],
      colours: ['Black'],
      materials: ['Wood'],
      occasionTags: ['Wedding'],
      minPrice: 50000,
      maxPrice: 150000,
      minRating: 4,
      inStockOnly: true,
      sort: 'price_asc',
    });
    expect(page).toBe(2);
  });

  it('omits sort when the value is invalid', () => {
    const { filters } = parseSearchFilters(new URLSearchParams('sort=bogus'));
    expect(filters.sort).toBeUndefined();
  });

  it('defaults page to 1 when the value is non-numeric', () => {
    const { page } = parseSearchFilters(new URLSearchParams('page=abc'));
    expect(page).toBe(1);
  });

  it('defaults page to 1 when the value is negative or zero', () => {
    expect(parseSearchFilters(new URLSearchParams('page=0')).page).toBe(1);
    expect(parseSearchFilters(new URLSearchParams('page=-5')).page).toBe(1);
  });

  it('omits minPrice/maxPrice when non-numeric', () => {
    const { filters } = parseSearchFilters(new URLSearchParams('minPrice=abc&maxPrice=xyz'));
    expect(filters.minPrice).toBeUndefined();
    expect(filters.maxPrice).toBeUndefined();
  });

  it('omits minPrice/maxPrice when negative', () => {
    const { filters } = parseSearchFilters(new URLSearchParams('minPrice=-1&maxPrice=-100'));
    expect(filters.minPrice).toBeUndefined();
    expect(filters.maxPrice).toBeUndefined();
  });

  it('omits minPrice/maxPrice/minRating when the param is present but empty', () => {
    const { filters } = parseSearchFilters(new URLSearchParams('minPrice=&maxPrice=&minRating='));
    expect(filters.minPrice).toBeUndefined();
    expect(filters.maxPrice).toBeUndefined();
    expect(filters.minRating).toBeUndefined();
  });

  it('produces empty filters and page 1 for empty URLSearchParams', () => {
    const { filters, page } = parseSearchFilters(new URLSearchParams());
    expect(filters).toEqual({});
    expect(page).toBe(1);
  });

  it('parses inStockOnly as true only for the exact string "true"', () => {
    expect(parseSearchFilters(new URLSearchParams('inStockOnly=true')).filters.inStockOnly).toBe(
      true
    );
    expect(
      parseSearchFilters(new URLSearchParams('inStockOnly=yes')).filters.inStockOnly
    ).toBeUndefined();
  });
});

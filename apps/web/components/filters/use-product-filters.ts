import { useMemo } from 'react';
import type { SearchFilters } from '@bro-pics/shared';

export interface ProductFiltersController {
  filters: SearchFilters;
  toggleSize: (size: string) => URLSearchParams;
  toggleColour: (colour: string) => URLSearchParams;
  toggleMaterial: (material: string) => URLSearchParams;
  setPriceRange: (minPrice: number, maxPrice: number) => URLSearchParams;
  clearAll: () => URLSearchParams;
}

function toggleListParam(params: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = new URLSearchParams(params);
  const current = next.getAll(key);
  next.delete(key);
  if (current.includes(value)) {
    for (const v of current.filter((c) => c !== value)) next.append(key, v);
  } else {
    for (const v of current) next.append(key, v);
    next.append(key, value);
  }
  return next;
}

export function useProductFilters(params: URLSearchParams): ProductFiltersController {
  const filters = useMemo<SearchFilters>(() => {
    const sizes = params.getAll('size');
    const colours = params.getAll('colour');
    const materials = params.getAll('material');
    const occasionTags = params.getAll('occasion');
    const minPrice = params.get('minPrice');
    const maxPrice = params.get('maxPrice');
    const minRating = params.get('minRating');
    const sort = params.get('sort') as SearchFilters['sort'] | null;

    return {
      ...(sizes.length > 0 && { sizes }),
      ...(colours.length > 0 && { colours }),
      ...(materials.length > 0 && { materials }),
      ...(occasionTags.length > 0 && { occasionTags }),
      ...(minPrice && { minPrice: Number(minPrice) }),
      ...(maxPrice && { maxPrice: Number(maxPrice) }),
      ...(minRating && { minRating: Number(minRating) }),
      ...(params.get('inStockOnly') === 'true' && { inStockOnly: true }),
      ...(sort && { sort }),
    };
  }, [params]);

  return {
    filters,
    toggleSize: (size) => toggleListParam(params, 'size', size),
    toggleColour: (colour) => toggleListParam(params, 'colour', colour),
    toggleMaterial: (material) => toggleListParam(params, 'material', material),
    setPriceRange: (minPrice, maxPrice) => {
      const next = new URLSearchParams(params);
      next.set('minPrice', String(minPrice));
      next.set('maxPrice', String(maxPrice));
      return next;
    },
    clearAll: () => new URLSearchParams(),
  };
}

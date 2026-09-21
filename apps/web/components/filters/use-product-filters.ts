import { useMemo } from 'react';
import { parseSearchFilters, type SearchFilters } from '@bro-pics/shared';

export interface ProductFiltersController {
  filters: SearchFilters;
  // Orientation has no backend field yet (derived client-side from
  // width/height — see docs/superpowers/specs/2026-09-14-frames-only-backend-changes.md),
  // so it's tracked as a plain "orientation" URL param outside the shared
  // SearchFilters shape rather than added to that schema.
  selectedOrientations: string[];
  toggleSize: (size: string) => URLSearchParams;
  toggleColour: (colour: string) => URLSearchParams;
  toggleMaterial: (material: string) => URLSearchParams;
  toggleOrientation: (orientation: string) => URLSearchParams;
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
  const filters = useMemo<SearchFilters>(() => parseSearchFilters(params).filters, [params]);

  return {
    filters,
    selectedOrientations: params.getAll('orientation'),
    toggleSize: (size) => toggleListParam(params, 'size', size),
    toggleColour: (colour) => toggleListParam(params, 'colour', colour),
    toggleMaterial: (material) => toggleListParam(params, 'material', material),
    toggleOrientation: (orientation) => toggleListParam(params, 'orientation', orientation),
    setPriceRange: (minPrice, maxPrice) => {
      const next = new URLSearchParams(params);
      next.set('minPrice', String(minPrice));
      next.set('maxPrice', String(maxPrice));
      return next;
    },
    clearAll: () => new URLSearchParams(),
  };
}

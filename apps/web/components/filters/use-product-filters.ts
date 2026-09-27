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
  // [FE-30] minRating/inStockOnly/sort were already parsed by
  // parseSearchFilters (and already understood by the backend's own
  // buildProductQueryPlan) — nothing here exposed a way to actually SET
  // them from the UI until now.
  setMinRating: (minRating: number | null) => URLSearchParams;
  toggleInStockOnly: () => URLSearchParams;
  setSort: (sort: SearchFilters['sort']) => URLSearchParams;
  clearAll: () => URLSearchParams;
}

// [FE-30] Every filter change resets to page 1 — without this, toggling a
// filter while on page 3 of the OLD result set could land the visitor on a
// page number that no longer exists for the new, smaller result set.
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
  next.delete('page');
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
      next.delete('page');
      return next;
    },
    setMinRating: (minRating) => {
      const next = new URLSearchParams(params);
      if (minRating === null) next.delete('minRating');
      else next.set('minRating', String(minRating));
      next.delete('page');
      return next;
    },
    toggleInStockOnly: () => {
      const next = new URLSearchParams(params);
      if (next.get('inStockOnly') === 'true') next.delete('inStockOnly');
      else next.set('inStockOnly', 'true');
      next.delete('page');
      return next;
    },
    setSort: (sort) => {
      const next = new URLSearchParams(params);
      if (!sort || sort === 'relevance') next.delete('sort');
      else next.set('sort', sort);
      next.delete('page');
      return next;
    },
    clearAll: () => new URLSearchParams(),
  };
}

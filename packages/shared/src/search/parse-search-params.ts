import type { SearchFilters } from './types';

const VALID_SORTS = new Set<NonNullable<SearchFilters['sort']>>([
  'relevance',
  'newest',
  'price_asc',
  'price_desc',
  'best_selling',
  'top_rated',
]);

function parseNonNegativeNumber(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0) return undefined;
  return value;
}

/**
 * Parses URL search params into a validated SearchFilters object plus a
 * page number, guarding against malformed/malicious query strings (invalid
 * sort values, non-numeric page/price params, etc.) that would otherwise
 * crash a server-rendered page or produce an invalid Firestore query. This
 * is the single source of truth for filter parsing, shared between the
 * server-rendered category page and the client-side filters hook so they
 * can no longer diverge on which params they understand.
 */
export function parseSearchFilters(params: URLSearchParams): {
  filters: SearchFilters;
  page: number;
} {
  const sizes = params.getAll('size');
  const colours = params.getAll('colour');
  const materials = params.getAll('material');
  const occasionTags = params.getAll('occasion');

  const minPrice = parseNonNegativeNumber(params.get('minPrice'));
  const maxPrice = parseNonNegativeNumber(params.get('maxPrice'));
  const minRating = parseNonNegativeNumber(params.get('minRating'));

  const rawSort = params.get('sort');
  const sort =
    rawSort !== null && VALID_SORTS.has(rawSort as NonNullable<SearchFilters['sort']>)
      ? (rawSort as NonNullable<SearchFilters['sort']>)
      : undefined;

  const rawPage = Number(params.get('page') ?? '1');
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const filters: SearchFilters = {
    ...(sizes.length > 0 && { sizes }),
    ...(colours.length > 0 && { colours }),
    ...(materials.length > 0 && { materials }),
    ...(occasionTags.length > 0 && { occasionTags }),
    ...(minPrice !== undefined && { minPrice }),
    ...(maxPrice !== undefined && { maxPrice }),
    ...(minRating !== undefined && { minRating }),
    ...(params.get('inStockOnly') === 'true' && { inStockOnly: true }),
    ...(sort && { sort }),
  };

  return { filters, page };
}

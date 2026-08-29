import type { SearchFilters } from './types';

export interface ProductQueryConstraint {
  field: string;
  op: '==' | '>=' | '<=' | 'array-contains-any';
  value: unknown;
}

export interface ProductQueryPostFilter {
  field: string;
  anyOf?: string[];
  gte?: number;
}

export interface ProductQueryPlan {
  constraints: ProductQueryConstraint[];
  postFilters: ProductQueryPostFilter[];
  orderByField: string;
  orderByDirection: 'asc' | 'desc';
  limit: number;
  offset: number;
}

const PAGE_SIZE = 20;

const SORT_MAP: Record<
  NonNullable<SearchFilters['sort']>,
  { orderByField: string; orderByDirection: 'asc' | 'desc' }
> = {
  relevance: { orderByField: 'createdAt', orderByDirection: 'desc' },
  newest: { orderByField: 'createdAt', orderByDirection: 'desc' },
  price_asc: { orderByField: 'minPrice', orderByDirection: 'asc' },
  price_desc: { orderByField: 'minPrice', orderByDirection: 'desc' },
  best_selling: { orderByField: 'ratingCount', orderByDirection: 'desc' },
  top_rated: { orderByField: 'ratingAverage', orderByDirection: 'desc' },
};

/**
 * Builds a Firestore query plan for product search/listing. Firestore
 * allows only one array-contains-any per query, so only the first
 * array-type filter present (checked in the order sizes, colours,
 * materials, occasionTags) becomes a native constraint — any others
 * become postFilters applied in-memory over the fetched page. This is
 * the "interim Firestore search" tradeoff from the Storefront design
 * spec: correct at the current catalogue scale, revisited with Algolia.
 */
export function buildProductQueryPlan(
  query: string,
  filters: SearchFilters,
  page: number
): ProductQueryPlan {
  const constraints: ProductQueryConstraint[] = [{ field: 'isActive', op: '==', value: true }];
  const postFilters: ProductQueryPostFilter[] = [];

  if (filters.categoryId) {
    constraints.push({ field: 'categoryId', op: '==', value: filters.categoryId });
  }
  if (filters.inStockOnly) {
    constraints.push({ field: 'inStock', op: '==', value: true });
  }
  if (filters.minPrice !== undefined) {
    constraints.push({ field: 'maxPrice', op: '>=', value: filters.minPrice });
  }
  if (filters.maxPrice !== undefined) {
    constraints.push({ field: 'minPrice', op: '<=', value: filters.maxPrice });
  }

  const arrayFilters: Array<{ field: string; values: string[] | undefined }> = [
    { field: 'availableSizes', values: filters.sizes },
    { field: 'availableColours', values: filters.colours },
    { field: 'availableMaterials', values: filters.materials },
    { field: 'occasionTags', values: filters.occasionTags },
  ];
  let nativeArrayFilterUsed = false;
  for (const { field, values } of arrayFilters) {
    if (!values || values.length === 0) continue;
    if (!nativeArrayFilterUsed) {
      constraints.push({ field, op: 'array-contains-any', value: values });
      nativeArrayFilterUsed = true;
    } else {
      postFilters.push({ field, anyOf: values });
    }
  }

  if (filters.minRating !== undefined) {
    postFilters.push({ field: 'ratingAverage', gte: filters.minRating });
  }

  if (query.trim().length > 0) {
    const normalized = query.trim().toLowerCase();
    // The upper bound must be strictly greater than every string with this
    // prefix. Appending U+F8FF (a private-use-area codepoint that sorts
    // after virtually all normal text) turns the range into a prefix match
    // instead of an exact match.
    constraints.push({ field: 'titleLower', op: '>=', value: normalized });
    constraints.push({ field: 'titleLower', op: '<=', value: `${normalized}` });
  }

  const { orderByField, orderByDirection } = SORT_MAP[filters.sort ?? 'relevance'];

  return {
    constraints,
    postFilters,
    orderByField,
    orderByDirection,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
}

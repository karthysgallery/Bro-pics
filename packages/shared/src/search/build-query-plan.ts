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

  // A free-text query is tokenized into whole words and matched against
  // Product.searchTokens (lowercased title+description words >2 chars,
  // populated at write time -- see scripts/seed/src/data.ts) via
  // array-contains-any, instead of a titleLower prefix range: prefix
  // matching only ever matched titles that literally START with the query
  // (e.g. "Classic" matches "Classic Wooden Photo Frame" but "frame" does
  // not), which is a poor match for how real users actually search a
  // photo-frame catalogue -- they type common nouns like "frame" or
  // "canvas", not the first word of a specific product's title.
  // searchTokens already exists in the schema and seed data for exactly
  // this purpose and was never wired up until now. array-contains-any is
  // also the ONE array-type constraint Firestore allows per query, so a
  // text query takes priority over the facet filters below when both are
  // present -- not that the current UI ever combines them (the search
  // page carries no facet filters, and the category page carries no text
  // query), but the ordering has to be decided somehow.
  const queryTokens =
    query.trim().length > 0
      ? [...new Set(query.trim().toLowerCase().split(/\s+/).filter((token) => token.length > 2))].slice(0, 30)
      : [];

  const arrayFilters: Array<{ field: string; values: string[] | undefined }> = [
    { field: 'availableSizes', values: filters.sizes },
    { field: 'availableColours', values: filters.colours },
    { field: 'availableMaterials', values: filters.materials },
    { field: 'occasionTags', values: filters.occasionTags },
  ];
  let nativeArrayFilterUsed = false;
  if (queryTokens.length > 0) {
    constraints.push({ field: 'searchTokens', op: 'array-contains-any', value: queryTokens });
    nativeArrayFilterUsed = true;
  }
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

  let { orderByField, orderByDirection } = SORT_MAP[filters.sort ?? 'relevance'];

  // Firestore requires the first orderBy to be on the same field as any
  // range/inequality filter in the query. A price range's inequality
  // field must win over whatever the user's sort preference would
  // otherwise pick. (A text query no longer needs this special-casing --
  // array-contains-any doesn't force an orderBy match the way a range
  // constraint does.)
  const hasMaxPriceInequality = constraints.some(
    (c) => c.field === 'maxPrice' && (c.op === '>=' || c.op === '<=')
  );
  const hasMinPriceInequality = constraints.some(
    (c) => c.field === 'minPrice' && (c.op === '>=' || c.op === '<=')
  );

  if (hasMaxPriceInequality || hasMinPriceInequality) {
    // Firestore requires the first orderBy to match one of the fields that
    // actually carries an inequality constraint. Because minPrice/maxPrice
    // filters are applied as an overlap check (see above), filters.minPrice
    // constrains the product's maxPrice field and filters.maxPrice
    // constrains the product's minPrice field — so the orderBy field must
    // be picked based on which constraint(s) are actually present, not
    // which user-facing filter was set.
    if (hasMinPriceInequality) {
      // Covers both "only maxPrice filter set" and "both filters set" —
      // 'minPrice' matches the composite index order (isActive, categoryId,
      // minPrice, maxPrice) in firestore.indexes.json.
      orderByField = 'minPrice';
    } else {
      // Only filters.minPrice was set, so only the maxPrice field carries
      // an inequality constraint.
      orderByField = 'maxPrice';
    }
    orderByDirection =
      filters.sort === 'price_asc' || filters.sort === 'price_desc' ? orderByDirection : 'asc';
  }

  return {
    constraints,
    postFilters,
    orderByField,
    orderByDirection,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
}

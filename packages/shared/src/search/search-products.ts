import type { Firestore, Query, DocumentData } from 'firebase-admin/firestore';
import { buildProductQueryPlan } from './build-query-plan';
import type { ProductQueryPostFilter } from './build-query-plan';
import type { SearchFilters, SearchResult } from './types';
import type { Product } from '../schemas/product';

function applyPostFilter(product: Product, postFilter: ProductQueryPostFilter): boolean {
  if (postFilter.anyOf) {
    const productValues = (product as unknown as Record<string, unknown>)[postFilter.field];
    if (!Array.isArray(productValues)) return false;
    return postFilter.anyOf.some((value) => productValues.includes(value));
  }
  if (postFilter.gte !== undefined) {
    const value = (product as unknown as Record<string, unknown>)[postFilter.field];
    return typeof value === 'number' && value >= postFilter.gte;
  }
  return true;
}

/**
 * Firestore-backed product search. This is the "interim" implementation
 * named in the Storefront design spec — callers depend only on this
 * function's signature, so a future Algolia-backed implementation can
 * replace the body without touching any call site.
 */
export async function searchProducts(
  db: Firestore,
  query: string,
  filters: SearchFilters,
  page: number
): Promise<SearchResult> {
  const plan = buildProductQueryPlan(query, filters, page);

  let firestoreQuery: Query<DocumentData> = db.collection('products');
  for (const constraint of plan.constraints) {
    firestoreQuery = firestoreQuery.where(constraint.field, constraint.op, constraint.value);
  }
  firestoreQuery = firestoreQuery.orderBy(plan.orderByField, plan.orderByDirection);

  // Post-filters may remove documents from the page, so overfetch by the
  // offset plus a generous buffer, then filter and slice in memory.
  const snapshot = await firestoreQuery.limit(plan.offset + plan.limit * 3).get();
  let products = snapshot.docs.map((doc) => doc.data() as Product);

  for (const postFilter of plan.postFilters) {
    products = products.filter((product) => applyPostFilter(product, postFilter));
  }

  const page_ = products.slice(plan.offset, plan.offset + plan.limit);
  return { products: page_, totalCount: products.length };
}

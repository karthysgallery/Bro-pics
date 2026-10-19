import { unstable_cache } from 'next/cache';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import { serializeDoc } from './serialize-doc';
import { searchProducts, FirestoreSearchProvider, type SearchFilters, type SearchResult } from '@bro-pics/shared';
import type { Category } from '@bro-pics/shared';

// Category pages read the URL's filters, so Next renders them on every visit. The catalogue behind them changes
// rarely, so the database answers are kept for 60 seconds (the same freshness the product pages already have):
// a busy category costs one set of reads a minute instead of one per visitor, and answers in ~1 ms instead of ~500 ms.
const CATALOGUE_CACHE_SECONDS = 60;

const categoryBySlugCached = unstable_cache(
  async (slug: string): Promise<Category | null> => {
    const db = getFirestore(getAdminApp());
    const snapshot = await db.collection('categories').where('slug', '==', slug).limit(1).get();
    if (snapshot.empty) return null;
    return serializeDoc(snapshot.docs[0].data() as Category);
  },
  ['category-by-slug'],
  { revalidate: CATALOGUE_CACHE_SECONDS }
);

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  return categoryBySlugCached(slug);
}

const browsePageCached = unstable_cache(
  async (filtersJson: string, page: number): Promise<SearchResult> => {
    const db = getFirestore(getAdminApp());
    const result = await searchProducts(db, '', JSON.parse(filtersJson) as SearchFilters, page);
    return { ...result, products: result.products.map(serializeDoc) };
  },
  ['browse-products-page'],
  { revalidate: CATALOGUE_CACHE_SECONDS }
);

export async function searchProductsPage(
  query: string,
  filters: SearchFilters,
  page: number
): Promise<SearchResult> {
  // Plain browsing (no typed words) repeats a lot and is cached; free-text searches are unbounded, so they are not.
  if (query.trim() === '') return browsePageCached(JSON.stringify(filters), page);
  const db = getFirestore(getAdminApp());
  const result = await searchProducts(db, query, filters, page);
  return {
    ...result,
    products: result.products.map(serializeDoc),
  };
}

// [BE-23] Category results for search — a "Wooden Frames" query should
// surface the matching category, not just products in it.
export async function searchCategoriesPage(query: string): Promise<Category[]> {
  const db = getFirestore(getAdminApp());
  const provider = new FirestoreSearchProvider(db);
  const categories = await provider.searchCategories(query);
  return categories.map(serializeDoc);
}

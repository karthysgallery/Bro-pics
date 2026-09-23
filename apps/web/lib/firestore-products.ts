import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import { serializeDoc } from './serialize-doc';
import { searchProducts, FirestoreSearchProvider, type SearchFilters, type SearchResult } from '@bro-pics/shared';
import type { Category } from '@bro-pics/shared';

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('categories').where('slug', '==', slug).limit(1).get();
  if (snapshot.empty) return null;
  return serializeDoc(snapshot.docs[0].data() as Category);
}

export async function searchProductsPage(
  query: string,
  filters: SearchFilters,
  page: number
): Promise<SearchResult> {
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

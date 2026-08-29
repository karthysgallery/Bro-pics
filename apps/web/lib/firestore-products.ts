import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import { searchProducts, type SearchFilters, type SearchResult } from '@bro-pics/shared';
import type { Category } from '@bro-pics/shared';

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('categories').where('slug', '==', slug).limit(1).get();
  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as Category;
}

export async function searchProductsPage(
  query: string,
  filters: SearchFilters,
  page: number
): Promise<SearchResult> {
  const db = getFirestore(getAdminApp());
  return searchProducts(db, query, filters, page);
}

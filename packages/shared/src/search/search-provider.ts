import type { Firestore } from 'firebase-admin/firestore';
import type { Category } from '../schemas/category';
import type { SearchFilters, SearchResult } from './types';
import { searchProducts } from './search-products';

/**
 * [BE-23] Formalizes the swap point searchProducts' own doc comment
 * already named informally ("a future Algolia-backed implementation can
 * replace the body without touching any call site") as an actual
 * interface — every call site depends on SearchProvider, not on
 * FirestoreSearchProvider directly, so a real swap is a one-line change
 * at whichever place constructs the provider, not a hunt through every
 * caller.
 */
export interface SearchProvider {
  searchProducts(query: string, filters: SearchFilters, page: number): Promise<SearchResult>;
  searchCategories(query: string): Promise<Category[]>;
}

/**
 * The only implementation for now — Firestore-backed product search
 * (searchProducts, unchanged) plus a simple in-memory category-name match.
 * Categories are a small, rarely-changing collection (unlike products),
 * so a full read + in-memory filter is the right trade-off here, the same
 * one GET /api/frame-templates/[variantId] already makes for its own
 * small collection.
 */
export class FirestoreSearchProvider implements SearchProvider {
  constructor(private readonly db: Firestore) {}

  async searchProducts(query: string, filters: SearchFilters, page: number): Promise<SearchResult> {
    return searchProducts(this.db, query, filters, page);
  }

  async searchCategories(query: string): Promise<Category[]> {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length === 0) return [];
    const snapshot = await this.db.collection('categories').where('isActive', '==', true).get();
    return snapshot.docs
      .map((doc) => doc.data() as Category)
      .filter((category) => category.name.toLowerCase().includes(trimmed));
  }
}

import type { Product } from '../schemas/product';

export interface SearchFilters {
  categoryId?: string;
  sizes?: string[];
  colours?: string[];
  materials?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStockOnly?: boolean;
  occasionTags?: string[];
  sort?: 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'best_selling' | 'top_rated';
}

export interface SearchResult {
  products: Product[];
  totalCount: number;
}

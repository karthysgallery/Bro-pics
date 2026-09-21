import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNewArrivals, getTrendingProducts, getWishlistBasedRecommendations } from './recommendations';

const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db, _col, id: string) => ({ id })),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));
vi.mock('./firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

function makeSnapshot(products: Array<Record<string, unknown>>) {
  return { docs: products.map((data) => ({ id: data.id, data: () => data })) };
}

function makeTimestamp(iso: string) {
  return { toMillis: () => new Date(iso).getTime() };
}

describe('recommendations', () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
    mockGetDoc.mockReset();
  });

  describe('getNewArrivals', () => {
    it('sorts active products newest-first and excludes the given product', async () => {
      mockGetDocs.mockResolvedValueOnce(
        makeSnapshot([
          { id: 'p1', createdAt: makeTimestamp('2026-01-01') },
          { id: 'p2', createdAt: makeTimestamp('2026-03-01') },
          { id: 'p3', createdAt: makeTimestamp('2026-02-01') },
        ])
      );
      const result = await getNewArrivals('p3', 8);
      expect(result.map((p) => p.id)).toEqual(['p2', 'p1']);
    });

    it('respects the count limit', async () => {
      mockGetDocs.mockResolvedValueOnce(
        makeSnapshot([
          { id: 'p1', createdAt: makeTimestamp('2026-01-01') },
          { id: 'p2', createdAt: makeTimestamp('2026-02-01') },
        ])
      );
      const result = await getNewArrivals(null, 1);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('p2');
    });
  });

  describe('getTrendingProducts', () => {
    it('sorts by ratingCount descending, tie-broken by recency', async () => {
      mockGetDocs.mockResolvedValueOnce(
        makeSnapshot([
          { id: 'low', ratingCount: 2, createdAt: makeTimestamp('2026-01-01') },
          { id: 'high', ratingCount: 10, createdAt: makeTimestamp('2026-01-01') },
          { id: 'tie-newer', ratingCount: 2, createdAt: makeTimestamp('2026-03-01') },
        ])
      );
      const result = await getTrendingProducts(null, 8);
      expect(result.map((p) => p.id)).toEqual(['high', 'tie-newer', 'low']);
    });
  });

  describe('getWishlistBasedRecommendations', () => {
    it('returns an empty list when the wishlist is empty, with no Firestore calls', async () => {
      const result = await getWishlistBasedRecommendations([], 8);
      expect(result).toEqual([]);
      expect(mockGetDoc).not.toHaveBeenCalled();
    });

    it('recommends same-category products, excluding items already wishlisted', async () => {
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, id: 'w1', data: () => ({ categoryId: 'cat-a' }) });
      mockGetDocs.mockResolvedValueOnce(
        makeSnapshot([
          { id: 'w1', categoryId: 'cat-a' },
          { id: 'other', categoryId: 'cat-a' },
        ])
      );
      const result = await getWishlistBasedRecommendations(['w1'], 8);
      expect(result.map((p) => p.id)).toEqual(['other']);
    });
  });
});

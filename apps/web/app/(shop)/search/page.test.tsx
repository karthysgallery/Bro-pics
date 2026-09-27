import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/firestore-products', () => ({
  searchProductsPage: vi.fn(),
  searchCategoriesPage: vi.fn(),
}));

vi.mock('../../../lib/firestore-homepage', () => ({
  getBestSellingProducts: vi.fn(),
}));

vi.mock('../../../components/product/ProductCard', () => ({
  ProductCard: vi.fn(),
}));

import { metadata } from './page';

describe('search page metadata', () => {
  it('marks the page non-indexable but crawlable for links', () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});

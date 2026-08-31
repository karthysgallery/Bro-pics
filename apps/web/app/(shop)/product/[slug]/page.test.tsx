import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../lib/firestore-product-detail', () => ({
  getProductBySlug: vi.fn(),
  getRelatedProducts: vi.fn(),
  getAllActiveProductSlugs: vi.fn(),
  getCategoryById: vi.fn(),
}));

import { getProductBySlug } from '../../../../lib/firestore-product-detail';
import { generateMetadata } from './page';

const mockProduct = {
  id: 'prod_test', title: 'Test Frame', slug: 'test-frame', categoryId: 'cat_frames',
  shortDesc: 'A test frame', descriptionHtml: '<p>Test</p>', highlights: [], howItWorks: [],
  careText: '', basePrice: 10000, isActive: true, isFeatured: false, badges: [],
  dispatchDaysMin: 3, dispatchDaysMax: 5, photoSlots: 1, allowsTextPersonalization: false,
  seo: { title: 'Test Frame | BroPics', description: 'Shop the test frame.' },
  createdAt: new Date(), updatedAt: new Date(),
  availableSizes: [], availableColours: [], availableMaterials: [],
  minPrice: 10000, maxPrice: 10000, occasionTags: [], inStock: true,
  ratingAverage: 4.5, ratingCount: 10, titleLower: 'test frame', searchTokens: [],
  faq: [], primaryImageUrl: '/placeholders/products/test-1.svg', hoverImageUrl: null,
};

describe('generateMetadata', () => {
  it('uses the product seo fields and primaryImageUrl for OG image', async () => {
    vi.mocked(getProductBySlug).mockResolvedValue({
      product: mockProduct, variants: [], media: [], reviews: [],
    });

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'test-frame' }) });

    expect(metadata.title).toBe('Test Frame | BroPics');
    expect(metadata.description).toBe('Shop the test frame.');
    expect(metadata.openGraph?.images).toEqual(['/placeholders/products/test-1.svg']);
  });

  it('returns fallback metadata when the product does not exist', async () => {
    vi.mocked(getProductBySlug).mockResolvedValue(null);
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'missing' }) });
    expect(metadata.title).toBe('Product Not Found | BroPics');
  });
});

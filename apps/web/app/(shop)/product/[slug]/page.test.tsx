import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/firestore-combos', () => ({ getPublishedCombos: vi.fn().mockResolvedValue([]) }));
vi.mock('../../../../lib/firestore-product-detail', () => ({
  getProductBySlug: vi.fn(),
  getRelatedProducts: vi.fn(),
  getFrequentlyBoughtTogether: vi.fn(),
  getAllActiveProductSlugs: vi.fn(),
  getCategoryById: vi.fn(),
  findCurrentSlugForOldSlug: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../../lib/firestore-settings', () => ({
  getSeoSettings: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../../lib/media-public-url', () => ({
  buildPublicMediaUrl: vi.fn((path: string) => `https://storage.example.com/${path}`),
}));

import { getProductBySlug, findCurrentSlugForOldSlug } from '../../../../lib/firestore-product-detail';
import { getSeoSettings } from '../../../../lib/firestore-settings';
import { generateMetadata } from './page';

const mockProduct = {
  id: 'prod_test', title: 'Test Frame', slug: 'test-frame', categoryId: 'cat_frames',
  shortDesc: 'A test frame', descriptionHtml: '<p>Test</p>', highlights: [], howItWorks: [],
  careText: '', basePrice: 10000, isActive: true, isFeatured: false, badges: [],
  dispatchDaysMin: 3, dispatchDaysMax: 5, photoSlots: 1, allowsTextPersonalization: false,
  seo: { title: 'Test Frame | KarthysGallery', description: 'Shop the test frame.' },
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

    expect(metadata.title).toBe('Test Frame | KarthysGallery');
    expect(metadata.description).toBe('Shop the test frame.');
    expect(metadata.openGraph?.images).toEqual([expect.objectContaining({ url: '/placeholders/products/test-1.svg' })]);
  });

  it('an unknown product is a real 404 (thrown while metadata resolves, before any HTML is sent)', async () => {
    vi.mocked(getProductBySlug).mockResolvedValue(null);
    await expect(generateMetadata({ params: Promise.resolve({ slug: 'missing' }) })).rejects.toThrow(/NOT_FOUND|404/);
  });

  it('a renamed product answers its old address with a permanent redirect to the new one', async () => {
    vi.mocked(getProductBySlug).mockResolvedValue(null);
    vi.mocked(findCurrentSlugForOldSlug).mockResolvedValueOnce('new-name');
    await expect(generateMetadata({ params: Promise.resolve({ slug: 'old-name' }) })).rejects.toMatchObject({
      digest: expect.stringMatching(/NEXT_REDIRECT;(replace|push);\/product\/new-name;308/),
    });
  });

  it('every product is its own canonical page, with generated title/description and social tags', async () => {
    vi.mocked(getProductBySlug).mockResolvedValue({ product: { ...mockProduct, seo: {} }, variants: [], media: [], reviews: [] } as never);
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'test-frame' }) });
    expect(metadata.alternates?.canonical).toBe('/product/test-frame');
    expect(metadata.title).toBe('Test Frame | KarthysGallery');
    expect(String(metadata.description)).toContain('A test frame');
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
    expect(metadata.openGraph).toMatchObject({ url: '/product/test-frame' });
  });

  it('[FE-42] falls back to settings/seo.ogImagePath only when the product has no primaryImageUrl of its own', async () => {
    vi.mocked(getSeoSettings).mockResolvedValueOnce({
      defaultTitle: 'KarthysGallery',
      defaultDescription: 'Personalized photo frames.',
      ogImagePath: 'seo/default-og.jpg',
    });
    vi.mocked(getProductBySlug).mockResolvedValueOnce({
      product: { ...mockProduct, primaryImageUrl: '' }, variants: [], media: [], reviews: [],
    });

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'test-frame' }) });
    expect(metadata.openGraph?.images).toEqual([expect.objectContaining({ url: 'https://storage.example.com/seo/default-og.jpg' })]);
  });

  it('[FE-42] never overrides a product\'s own real image with the settings fallback', async () => {
    vi.mocked(getSeoSettings).mockResolvedValueOnce({
      defaultTitle: 'KarthysGallery',
      defaultDescription: 'Personalized photo frames.',
      ogImagePath: 'seo/default-og.jpg',
    });
    vi.mocked(getProductBySlug).mockResolvedValueOnce({
      product: mockProduct, variants: [], media: [], reviews: [],
    });

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'test-frame' }) });
    expect(metadata.openGraph?.images).toEqual([expect.objectContaining({ url: '/placeholders/products/test-1.svg' })]);
  });
});

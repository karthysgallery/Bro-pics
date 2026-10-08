import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/firestore-combos', () => ({ getPublishedCombos: vi.fn().mockResolvedValue([]) }));
vi.mock('../../../../lib/firestore-categories', () => ({ getActiveCategories: vi.fn().mockResolvedValue([]) }));

vi.mock('../../../../lib/firestore-products', () => ({
  getCategoryBySlug: vi.fn(),
  searchProductsPage: vi.fn(),
}));

vi.mock('../../../../lib/firestore-settings', () => ({
  getSeoSettings: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../../lib/media-public-url', () => ({
  buildPublicMediaUrl: vi.fn((path: string) => `https://storage.example.com/${path}`),
}));

import { getCategoryBySlug } from '../../../../lib/firestore-products';
import { getSeoSettings } from '../../../../lib/firestore-settings';
import { generateMetadata } from './page';

const mockCategory = {
  id: 'cat_frames', name: 'Frames & Wall Décor', slug: 'frames-wall-decor', parentId: null,
  image: '/placeholders/categories/frames.svg', sortOrder: 1, isActive: true,
  seo: { title: 'Frames & Wall Décor | KarthysGallery', description: 'Shop our frame collection.' },
};

describe('category generateMetadata', () => {
  it('uses the category seo fields and image for OG image', async () => {
    vi.mocked(getCategoryBySlug).mockResolvedValue(mockCategory as never);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'frames-wall-decor' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Frames & Wall Décor | KarthysGallery');
    expect(metadata.description).toBe('Shop our frame collection.');
    expect(metadata.openGraph?.images).toEqual(['/placeholders/categories/frames.svg']);
  });

  it('falls back to name-derived title/description when seo fields are unset', async () => {
    vi.mocked(getCategoryBySlug).mockResolvedValue({ ...mockCategory, seo: {} } as never);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'frames-wall-decor' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Frames & Wall Décor | KarthysGallery');
  });

  it('an unknown category is a real 404', async () => {
    vi.mocked(getCategoryBySlug).mockResolvedValue(null);
    await expect(generateMetadata({ params: Promise.resolve({ slug: 'missing' }), searchParams: Promise.resolve({}) })).rejects.toThrow(/NOT_FOUND|404/);
  });

  it('page 2 is its own canonical, indexable page (it lists different products); filters point back at the category', async () => {
    vi.mocked(getCategoryBySlug).mockResolvedValue(mockCategory as never);

    const page2 = await generateMetadata({ params: Promise.resolve({ slug: 'frames-wall-decor' }), searchParams: Promise.resolve({ page: '2' }) });
    expect(page2.robots).toBeUndefined();
    expect(page2.alternates?.canonical).toBe('/category/frames-wall-decor?page=2');
    expect(page2.title).toMatch(/Page 2$/);

    const oneFacet = await generateMetadata({ params: Promise.resolve({ slug: 'frames-wall-decor' }), searchParams: Promise.resolve({ size: '8x12 in' }) });
    expect(oneFacet.alternates?.canonical).toBe('/category/frames-wall-decor');

    const twoFacets = await generateMetadata({ params: Promise.resolve({ slug: 'frames-wall-decor' }), searchParams: Promise.resolve({ size: '8x12 in', colour: 'Black' }) });
    expect(twoFacets.robots).toEqual({ index: false, follow: true });
    expect(twoFacets.alternates?.canonical).toBe('/category/frames-wall-decor');
  });

  it('[FE-42] falls back to settings/seo.ogImagePath only when the category has no image of its own', async () => {
    vi.mocked(getSeoSettings).mockResolvedValueOnce({
      defaultTitle: 'KarthysGallery',
      defaultDescription: 'Personalized photo frames.',
      ogImagePath: 'seo/default-og.jpg',
    });
    vi.mocked(getCategoryBySlug).mockResolvedValueOnce({ ...mockCategory, image: '' } as never);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'frames-wall-decor' }),
      searchParams: Promise.resolve({}),
    });
    expect(metadata.openGraph?.images).toEqual(['https://storage.example.com/seo/default-og.jpg']);
  });

  it('[FE-42] never overrides a category\'s own real image with the settings fallback', async () => {
    vi.mocked(getSeoSettings).mockResolvedValueOnce({
      defaultTitle: 'KarthysGallery',
      defaultDescription: 'Personalized photo frames.',
      ogImagePath: 'seo/default-og.jpg',
    });
    vi.mocked(getCategoryBySlug).mockResolvedValueOnce(mockCategory as never);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'frames-wall-decor' }),
      searchParams: Promise.resolve({}),
    });
    expect(metadata.openGraph?.images).toEqual(['/placeholders/categories/frames.svg']);
  });
});

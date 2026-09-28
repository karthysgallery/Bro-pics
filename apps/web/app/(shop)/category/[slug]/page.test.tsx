import { describe, it, expect, vi } from 'vitest';

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
  seo: { title: 'Frames & Wall Décor | BroPics', description: 'Shop our frame collection.' },
};

describe('category generateMetadata', () => {
  it('uses the category seo fields and image for OG image', async () => {
    vi.mocked(getCategoryBySlug).mockResolvedValue(mockCategory as never);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'frames-wall-decor' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Frames & Wall Décor | BroPics');
    expect(metadata.description).toBe('Shop our frame collection.');
    expect(metadata.openGraph?.images).toEqual(['/placeholders/categories/frames.svg']);
  });

  it('falls back to name-derived title/description when seo fields are unset', async () => {
    vi.mocked(getCategoryBySlug).mockResolvedValue({ ...mockCategory, seo: {} } as never);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'frames-wall-decor' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Frames & Wall Décor | BroPics');
  });

  it('returns fallback metadata when the category does not exist', async () => {
    vi.mocked(getCategoryBySlug).mockResolvedValue(null);
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'missing' }),
      searchParams: Promise.resolve({}),
    });
    expect(metadata.title).toBe('Category Not Found | BroPics');
  });

  it('[FE-42] does not noindex a bare category URL or one with a single facet', async () => {
    vi.mocked(getCategoryBySlug).mockResolvedValue(mockCategory as never);

    const bare = await generateMetadata({
      params: Promise.resolve({ slug: 'frames-wall-decor' }),
      searchParams: Promise.resolve({}),
    });
    expect(bare.robots).toBeUndefined();

    const oneFacet = await generateMetadata({
      params: Promise.resolve({ slug: 'frames-wall-decor' }),
      searchParams: Promise.resolve({ size: '8x12 in' }),
    });
    expect(oneFacet.robots).toBeUndefined();
  });

  it('[FE-42] noindexes (but still follows) a URL stacking two or more facets', async () => {
    vi.mocked(getCategoryBySlug).mockResolvedValue(mockCategory as never);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'frames-wall-decor' }),
      searchParams: Promise.resolve({ size: '8x12 in', colour: 'Black' }),
    });
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it('[FE-42] noindexes page 2 onward', async () => {
    vi.mocked(getCategoryBySlug).mockResolvedValue(mockCategory as never);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'frames-wall-decor' }),
      searchParams: Promise.resolve({ page: '2' }),
    });
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it('[FE-42] falls back to settings/seo.ogImagePath only when the category has no image of its own', async () => {
    vi.mocked(getSeoSettings).mockResolvedValueOnce({
      defaultTitle: 'BroPics',
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
      defaultTitle: 'BroPics',
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

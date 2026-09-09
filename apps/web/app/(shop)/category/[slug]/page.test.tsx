import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../lib/firestore-products', () => ({
  getCategoryBySlug: vi.fn(),
  searchProductsPage: vi.fn(),
}));

import { getCategoryBySlug } from '../../../../lib/firestore-products';
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
});

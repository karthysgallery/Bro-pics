import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/firestore-product-detail', () => ({
  getAllActiveProductSlugs: vi.fn(),
}));
vi.mock('../lib/firestore-categories', () => ({
  getActiveCategories: vi.fn(),
}));

import { getAllActiveProductSlugs } from '../lib/firestore-product-detail';
import { getActiveCategories } from '../lib/firestore-categories';
import sitemap from './sitemap';

describe('sitemap', () => {
  it('includes static routes, every active product, and every active category', async () => {
    vi.mocked(getAllActiveProductSlugs).mockResolvedValue(['classic-wooden-frame', 'canvas-print']);
    vi.mocked(getActiveCategories).mockResolvedValue([
      { id: 'cat_1', name: 'Frames', slug: 'frames-wall-decor', parentId: null, image: '', sortOrder: 1, isActive: true, seo: {} },
    ] as never);

    const result = await sitemap();
    const urls = result.map((entry) => entry.url);

    expect(urls).toContain(process.env.NEXT_PUBLIC_SITE_URL + '/');
    expect(urls).toContain(process.env.NEXT_PUBLIC_SITE_URL + '/search');
    expect(urls).toContain(process.env.NEXT_PUBLIC_SITE_URL + '/product/classic-wooden-frame');
    expect(urls).toContain(process.env.NEXT_PUBLIC_SITE_URL + '/product/canvas-print');
    expect(urls).toContain(process.env.NEXT_PUBLIC_SITE_URL + '/category/frames-wall-decor');
  });
});

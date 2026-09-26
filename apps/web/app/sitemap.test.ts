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

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bropics.example.com';

describe('sitemap', () => {
  it('includes static routes, every active product, and every active category', async () => {
    vi.mocked(getAllActiveProductSlugs).mockResolvedValue(['classic-wooden-frame', 'canvas-print']);
    vi.mocked(getActiveCategories).mockResolvedValue([
      { id: 'cat_1', name: 'Frames', slug: 'frames-wall-decor', parentId: null, image: '', sortOrder: 1, isActive: true, seo: {} },
    ] as never);

    const result = await sitemap();
    const urls = result.map((entry) => entry.url);

    expect(urls).toContain(`${baseUrl}/`);
    expect(urls).toContain(`${baseUrl}/search`);
    expect(urls).toContain(`${baseUrl}/product/classic-wooden-frame`);
    expect(urls).toContain(`${baseUrl}/product/canvas-print`);
    expect(urls).toContain(`${baseUrl}/category/frames-wall-decor`);
  });

  it('[BE-40] includes the static CMS/content pages', async () => {
    vi.mocked(getAllActiveProductSlugs).mockResolvedValue([]);
    vi.mocked(getActiveCategories).mockResolvedValue([]);

    const result = await sitemap();
    const urls = result.map((entry) => entry.url);

    for (const page of ['about', 'contact', 'faq', 'how-it-works', 'picture-quality-guide', 'privacy', 'return-refund-policy', 'shipping-policy', 'terms']) {
      expect(urls).toContain(`${baseUrl}/${page}`);
    }
  });
});

import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/firestore-product-detail', () => ({
  getSitemapProducts: vi.fn(),
}));
vi.mock('../lib/firestore-categories', () => ({
  getActiveCategories: vi.fn(),
}));
vi.mock('../lib/firestore-combos', () => ({
  getPublishedCombos: vi.fn().mockResolvedValue([]),
}));

import { getSitemapProducts } from '../lib/firestore-product-detail';
import { getActiveCategories } from '../lib/firestore-categories';
import { getPublishedCombos } from '../lib/firestore-combos';
import sitemap from './sitemap';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://karthysgallery.in';

describe('sitemap', () => {
  it('includes static routes, every active product, and every active category', async () => {
    vi.mocked(getSitemapProducts).mockResolvedValue([{ slug: 'classic-wooden-frame', updatedAt: new Date('2026-10-01'), image: '/p/frame.jpg' }, { slug: 'canvas-print' }]);
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
    const frame = result.find((e) => e.url.endsWith('/classic-wooden-frame'))!;
    expect(frame.lastModified).toEqual(new Date('2026-10-01'));
    expect(frame.images).toEqual([`${baseUrl}/p/frame.jpg`]);
  });

  it('[BE-40] includes the static CMS/content pages', async () => {
    vi.mocked(getSitemapProducts).mockResolvedValue([]);
    vi.mocked(getActiveCategories).mockResolvedValue([]);

    const result = await sitemap();
    const urls = result.map((entry) => entry.url);

    for (const page of ['about', 'contact', 'faq', 'how-it-works', 'picture-quality-guide', 'privacy', 'return-refund-policy', 'shipping-policy', 'terms']) {
      expect(urls).toContain(`${baseUrl}/${page}`);
    }
  });

  it('lists published combos and their index page, and nothing extra when there are none', async () => {
    vi.mocked(getSitemapProducts).mockResolvedValue([]);
    vi.mocked(getActiveCategories).mockResolvedValue([]);
    vi.mocked(getPublishedCombos).mockResolvedValueOnce([{ slug: 'triple-9', updatedAt: '2026-10-02T00:00:00.000Z', coverImageUrl: '/c.jpg' }] as never);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${baseUrl}/combos`);
    expect(urls).toContain(`${baseUrl}/combo/triple-9`);

    expect((await sitemap()).map((e) => e.url)).not.toContain(`${baseUrl}/combos`);
  });
});

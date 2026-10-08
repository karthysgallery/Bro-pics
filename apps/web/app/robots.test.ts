import { describe, it, expect, afterEach } from 'vitest';
import robots, { ALLOWED_API_PATHS, DISALLOWED_PATHS } from './robots';

describe('robots.txt', () => {
  afterEach(() => { delete process.env.SITE_PREVIEW; });

  it('on the real site: crawl everything public, close private areas, point at the production sitemap', () => {
    const r = robots() as { rules: { allow: string[]; disallow: string[] }; sitemap: string };
    expect(r.sitemap).toBe('https://karthysgallery.in/sitemap.xml');
    for (const path of ['/admin', '/checkout', '/cart', '/account', '/search', '/api/']) expect(r.rules.disallow).toContain(path);
    // Product pages, categories, combos, content and images must not be blocked.
    for (const path of ['/product/', '/category/', '/combo/', '/combos', '/about', '/placeholders/', '/_next/']) {
      expect(DISALLOWED_PATHS.some((d) => path.startsWith(d))).toBe(false);
    }
    // Public images are served via /api/media/ — it must stay open although /api/ is closed.
    expect(ALLOWED_API_PATHS).toEqual(['/api/media/']);
    expect(r.rules.allow).toContain('/api/media/');
  });

  it('on the preview deployment: nothing may be crawled and no sitemap is advertised', () => {
    process.env.SITE_PREVIEW = '1';
    const r = robots() as { rules: { disallow: string }; sitemap?: string };
    expect(r.rules.disallow).toBe('/');
    expect(r.sitemap).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { buildSitemapIndex, buildUrlset, escapeXml } from './sitemap-xml';
import { canonicalUrl, isForbiddenSeoHost, absoluteUrl } from './site';

describe('canonical origin', () => {
  it('always builds addresses on the production domain', () => {
    expect(canonicalUrl('/product/x')).toBe('https://karthysgallery.in/product/x');
    expect(canonicalUrl('product/x/')).toBe('https://karthysgallery.in/product/x');
    expect(canonicalUrl('/')).toBe('https://karthysgallery.in/');
    expect(absoluteUrl('/p/a.jpg')).toBe('https://karthysgallery.in/p/a.jpg');
    expect(absoluteUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
  });
  it('recognises hosts that must never appear in an SEO URL', () => {
    for (const host of ['karthys-gallery-991383044884.asia-south1.run.app', 'bropics-app.web.app', 'bropics-app.firebaseapp.com', 'localhost', 'x.vercel.app', '127.0.0.1']) expect(isForbiddenSeoHost(host)).toBe(true);
    expect(isForbiddenSeoHost('karthysgallery.in')).toBe(false);
  });
});

describe('sitemap XML', () => {
  it('escapes markup characters', () => {
    expect(escapeXml(`a&b<c>"d"'e'`)).toBe('a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;');
  });

  it('builds a valid urlset with lastmod and image entries, and omits lastmod it does not know', () => {
    const xml = buildUrlset([
      { loc: 'https://karthysgallery.in/product/a?x=1&y=2', lastmod: new Date('2026-10-01T00:00:00Z'), changefreq: 'weekly', priority: 0.8, images: [{ loc: 'https://karthysgallery.in/i.jpg', title: 'A & B', caption: 'Alt' }] },
      { loc: 'https://karthysgallery.in/category/frames' },
    ]);
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(xml).toContain('<loc>https://karthysgallery.in/product/a?x=1&amp;y=2</loc>');
    expect(xml).toContain('<lastmod>2026-10-01T00:00:00.000Z</lastmod>');
    expect(xml).toContain('<image:title>A &amp; B</image:title>');
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it('omits the image namespace when no entry has images', () => {
    expect(buildUrlset([{ loc: 'https://karthysgallery.in/' }])).not.toContain('xmlns:image');
  });

  it('builds a sitemap index', () => {
    const xml = buildSitemapIndex([{ loc: 'https://karthysgallery.in/sitemap-products.xml', lastmod: '2026-10-08T00:00:00Z' }]);
    expect(xml).toContain('<sitemapindex');
    expect(xml).toContain('<loc>https://karthysgallery.in/sitemap-products.xml</loc>');
    expect(xml).toContain('<lastmod>2026-10-08T00:00:00.000Z</lastmod>');
  });
});

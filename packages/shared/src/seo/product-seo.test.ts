import { describe, it, expect } from 'vitest';
import { analyseProductSeo, containsPhrase, slugify, suggestSeo } from './product-seo';
import { buildProductSearchFields } from '../search/product-search-fields';

const base = {
  title: 'Classic Wooden Photo Frame',
  slug: 'classic-wooden-frame',
  shortDesc: 'A solid wood frame for your favourite photo.',
  descriptionHtml: '<p>Short.</p>',
  hasImage: true,
};

describe('product SEO check', () => {
  it('scores a product with no SEO work low, with clear fixes', () => {
    const r = analyseProductSeo(base);
    expect(r.grade).toBe('poor');
    expect(r.checks.find((c) => c.id === 'focus')!.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'focus')!.fix).toMatch(/phrase customers type/);
    expect(r.preview.title).toBe('Classic Wooden Photo Frame | KarthysGallery');
  });

  it('scores a fully optimised "vijay photo frame" page as good', () => {
    const body = `<p>${'This Vijay photo frame is made for every Thalapathy fan. '.repeat(14)}</p>`;
    const r = analyseProductSeo({
      ...base,
      title: 'Thalapathy Vijay Photo Frame',
      slug: 'thalapathy-vijay-photo-frame',
      descriptionHtml: body,
      seoTitle: 'Vijay Photo Frame – Thalapathy Fan Gift | KarthysGallery',
      seoDescription: 'Buy a Vijay photo frame online. Personalised Thalapathy frames with your photo, handcrafted in India and delivered fast across Tamil Nadu.',
      focusKeyword: 'vijay photo frame',
      keywords: ['thalapathy vijay frame', 'vijay fan gift', 'vijay wall frame'],
      imageAlt: 'Thalapathy Vijay photo frame in a wooden finish',
    });
    expect(r.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual([]);
    expect(r.score).toBe(100);
    expect(r.grade).toBe('good');
  });

  it('matches keywords regardless of order and plurals', () => {
    expect(containsPhrase('Frame of Vijay', 'vijay frame')).toBe(true);
    expect(containsPhrase('Vijay photo frames', 'vijay photo frame')).toBe(true);
    expect(containsPhrase('Ajith frame', 'vijay frame')).toBe(false);
  });

  it('suggests a title, description, address and alt text around the keyword', () => {
    const s = suggestSeo({ ...base, focusKeyword: 'vijay photo frame' });
    expect(s.seoTitle).toMatch(/^Vijay Photo Frame – Classic Wooden Photo Frame/);
    expect(s.seoTitle.length).toBeLessThanOrEqual(65);
    expect(s.seoDescription.length).toBeLessThanOrEqual(160);
    expect(s.slug).toBe('vijay-photo-frame-classic-wooden-photo-frame');
    expect(slugify('Thalapathy Vijay Frame!')).toBe('thalapathy-vijay-frame');
  });

  it("lets the shop's own search find a product by its keywords", () => {
    expect(buildProductSearchFields('Classic frame', 'Wood', ['vijay photo frame']).searchTokens).toContain('vijay');
  });
});

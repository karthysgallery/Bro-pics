import { describe, it, expect } from 'vitest';
import { plainText, productImageAlt, productSeoDescription, productSeoReport, productSeoTitle, truncateAtWord } from './product-seo';

const base = {
  title: 'Personalized 3 Photo Collage Frame',
  slug: 'personalized-3-photo-collage-frame',
  shortDesc: 'A three-photo collage frame with a black border for your favourite memories.',
  photoSlots: 3,
  allowsTextPersonalization: false,
  primaryImageUrl: '/p/a.jpg',
  seo: {},
  minPrice: 189900,
};

describe('productSeoTitle', () => {
  it('uses the owner\'s title when written, else "<name> | KarthysGallery"', () => {
    expect(productSeoTitle({ title: 'Mug', seo: { title: 'Custom Photo Mug Online' } })).toBe('Custom Photo Mug Online');
    expect(productSeoTitle({ title: 'Personalized 3 Photo Collage Frame', seo: {} })).toBe('Personalized 3 Photo Collage Frame | KarthysGallery');
  });
  it('drops the brand suffix rather than exceed 60 characters', () => {
    const long = 'Personalized Vintage Multi-Photo Collage Frame With Six Openings';
    expect(productSeoTitle({ title: long, seo: {} })).toBe(long);
  });
});

describe('productSeoDescription', () => {
  it('is built from the product\'s own data: description, photo count, starting price', () => {
    const d = productSeoDescription(base);
    expect(d).toContain('three-photo collage frame');
    expect(d).toContain('From ₹1,899');
    expect(d.length).toBeLessThanOrEqual(160);
  });
  it('differs between products and never repeats one description for two products', () => {
    const other = productSeoDescription({ ...base, title: 'Mini Desk Photo Frame', slug: 'desk', shortDesc: 'A compact desk frame for one photo.', photoSlots: 1, minPrice: 34900 });
    expect(other).not.toBe(productSeoDescription(base));
    expect(other).toContain('Upload your photo');
    expect(productSeoDescription({ ...base, shortDesc: 'Short.', photoSlots: 3 })).toContain('Add your 3 photos');
  });
  it('prefers the owner\'s description, and falls back to the title when there is no short description', () => {
    expect(productSeoDescription({ ...base, seo: { description: '  Hand-written.  ' } })).toBe('Hand-written.');
    expect(productSeoDescription({ ...base, shortDesc: '' })).toMatch(/^Personalized 3 Photo Collage Frame\./);
  });
  it('mentions a message only for products that take text, and no price when there is none', () => {
    expect(productSeoDescription({ ...base, shortDesc: 'A desk frame.', photoSlots: 1, allowsTextPersonalization: true, minPrice: 0 })).toMatch(/add a message/);
    expect(productSeoDescription({ ...base, minPrice: 0 })).not.toContain('From ₹');
  });
});

describe('text helpers', () => {
  it('strips markup and cuts on a word boundary', () => {
    expect(plainText('<p>Fine &amp; <b>dandy</b>&nbsp;frame</p>')).toBe('Fine & dandy frame');
    expect(truncateAtWord('one two three four five six', 15)).toBe('one two three…');
    expect(truncateAtWord('short', 15)).toBe('short');
  });
  it('gives images a real description, never a generic one', () => {
    expect(productImageAlt({ title: 'Desk Frame', seo: {} })).toBe('Desk Frame — personalized photo frame');
    expect(productImageAlt({ title: 'Desk Frame', seo: { imageAlt: 'Black desk frame with a couple photo' } })).toBe('Black desk frame with a couple photo');
  });
});

describe('productSeoReport', () => {
  it('reports canonical, sitemap inclusion and a completeness score', () => {
    const report = productSeoReport({ ...base, isActive: true });
    expect(report.canonicalUrl).toBe('https://karthysgallery.in/product/personalized-3-photo-collage-frame');
    expect(report.inSitemap).toBe(true);
    expect(report.score).toBeGreaterThan(70);
  });
  it('keeps archived or noindex products out of the sitemap and lowers the score for thin data', () => {
    expect(productSeoReport({ ...base, isActive: false }).inSitemap).toBe(false);
    expect(productSeoReport({ ...base, isActive: true, seo: { noindex: true } }).inSitemap).toBe(false);
    const thin = productSeoReport({ ...base, shortDesc: 'x', primaryImageUrl: '' });
    expect(thin.checks.filter((c) => c.required && !c.ok).length).toBeGreaterThan(0);
    expect(thin.score).toBeLessThan(productSeoReport(base).score);
  });
});

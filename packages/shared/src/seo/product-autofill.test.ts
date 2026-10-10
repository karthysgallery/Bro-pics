import { describe, it, expect } from 'vitest';
import { autofillScore, focusKeywordFor, generateProductDetails, type AutofillInput } from './product-autofill';
import { analyseProductSeo } from './product-seo';

const models = [
  { name: 'Teak Classic', colour: 'Brown', material: 'Wood' },
  { name: 'Royal Gold', colour: 'Gold', material: 'Synthetic (PS)' },
];
const base: AutofillInput = { name: 'Lord Murugan', productType: 'ready_made', subject: 'Lord Murugan', sizeLabels: ['8x12 in', '12x18 in', '20x30 in'], frameModels: models, dispatchDaysMin: 2, dispatchDaysMax: 4 };

const cases: Array<[string, AutofillInput]> = [
  ['ready-made devotional', base],
  ['ready-made film star, no subject', { ...base, name: 'Thalapathy Vijay', subject: undefined }],
  ['single photo', { ...base, productType: 'single_photo', name: 'Classic Photo Frame', subject: undefined }],
  ['collage', { ...base, productType: 'collage', name: 'Forever and Always Collage', subject: undefined, photoCount: 29 }],
  ['very long name', { ...base, name: 'Premium Handcrafted Beautiful Customised Lord Shiva Parvati Ganesha Family Divine Blessing Wall Frame', subject: undefined }],
  ['one size, one model, no models', { ...base, sizeLabels: ['8x10 in'], frameModels: [] }],
  ['Tamil characters in name', { ...base, name: 'முருகன் Murugan', subject: undefined }],
];

describe('generateProductDetails (free, rule-based)', () => {
  it.each(cases)('%s: every SEO check passes — score 100 with a photo', (_label, input) => {
    const out = generateProductDetails(input);
    const report = analyseProductSeo({
      title: out.title, slug: out.slug, shortDesc: out.shortDesc, descriptionHtml: out.descriptionHtml,
      seoTitle: out.seo.title, seoDescription: out.seo.description, focusKeyword: out.seo.focusKeyword,
      keywords: out.seo.keywords, imageAlt: out.seo.imageAlt, hasImage: true,
    });
    expect(report.checks.filter((c) => !c.ok).map((c) => c.label)).toEqual([]);
    expect(report.score).toBe(100);
    expect(out.seo.title.length).toBeLessThanOrEqual(60);
    expect(out.faq.length).toBeGreaterThanOrEqual(4);
    expect(out.highlights.length).toBeGreaterThanOrEqual(4);
    expect(out.slug).toMatch(/^[a-z0-9-]+$/);
    expect(out.productCode).toMatch(/^[A-Z0-9]{1,12}$/);
  });

  it('is honest about the photo: without one the score is below 100', () => {
    expect(autofillScore(generateProductDetails(base), false)).toBeLessThan(100);
  });

  it('builds the search phrase people type, dropping filler words', () => {
    expect(focusKeywordFor({ name: 'Lord Murugan', productType: 'ready_made' })).toBe('lord murugan photo frame');
    expect(focusKeywordFor({ name: 'Premium Customised Classic Photo Frame', productType: 'single_photo' })).toBe('classic photo frame');
    expect(focusKeywordFor({ name: 'Forever Collage', productType: 'collage' })).toBe('forever photo collage frame');
  });

  it('only states facts it was given (sizes, frame models, dispatch time) and asks no photo for ready-made', () => {
    const out = generateProductDetails(base);
    expect(out.descriptionHtml).toContain('8x12 in, 12x18 in and 20x30 in');
    expect(out.descriptionHtml).toContain('Teak Classic and Royal Gold');
    expect(out.faq.find((f) => f.question === 'Do I need to send a photo?')?.answer).toMatch(/^No\./);
    expect(out.descriptionHtml).not.toMatch(/<script|undefined|NaN/);
  });

  it("keeps the owner's own words in the name when the picture's subject is different", () => {
    const out = generateProductDetails({ ...base, name: 'Vijay', subject: 'CM of Tamilnadu' });
    expect(out.title).toBe('Vijay Cm Of Tamilnadu Photo Frame');
    expect(out.seo.focusKeyword).toBe('cm of tamilnadu photo frame');
    expect(autofillScore(out)).toBe(100);
  });
});

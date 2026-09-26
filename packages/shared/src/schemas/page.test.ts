import { describe, it, expect } from 'vitest';
import { PageSchema } from './page';

const validPage = {
  id: 'page_about',
  slug: 'about',
  title: 'About Us',
  bodyHtml: '<p>We make personalized photo frames.</p>',
  seo: {},
  isPublished: true,
  updatedAt: new Date('2026-09-01'),
};

describe('PageSchema', () => {
  it('accepts a valid page with no seo overrides', () => {
    expect(PageSchema.parse(validPage)).toEqual(validPage);
  });

  it('accepts seo title/description', () => {
    const withSeo = { ...validPage, seo: { title: 'About BroPics', description: 'Learn more about us' } };
    expect(PageSchema.parse(withSeo)).toEqual(withSeo);
  });

  it('rejects a missing slug', () => {
    const { slug: _slug, ...rest } = validPage;
    expect(() => PageSchema.parse(rest)).toThrow();
  });
});

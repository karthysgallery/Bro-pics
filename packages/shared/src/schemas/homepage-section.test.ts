import { describe, it, expect } from 'vitest';
import { HomepageSectionSchema } from './homepage-section';

const validSection = {
  id: 'sec_hero',
  type: 'hero_slider' as const,
  title: 'Handcrafted with Love',
  subtitle: 'Personalized photo frames made just for you',
  image: '/placeholders/home/hero-1.jpg',
  mobileImage: '/placeholders/home/hero-1-mobile.jpg',
  link: '/category/all',
  sortOrder: 1,
  startsAt: null,
  endsAt: null,
  isActive: true,
  config: {},
};

describe('HomepageSectionSchema', () => {
  it('accepts a valid section with no schedule window', () => {
    expect(HomepageSectionSchema.parse(validSection)).toEqual(validSection);
  });

  it('accepts a section with a schedule window', () => {
    const scheduled = {
      ...validSection,
      startsAt: new Date('2026-09-01'),
      endsAt: new Date('2026-09-30'),
    };
    expect(HomepageSectionSchema.parse(scheduled)).toMatchObject({
      startsAt: new Date('2026-09-01'),
    });
  });

  it('rejects an unknown section type', () => {
    const invalid = { ...validSection, type: 'random_banner' };
    expect(() => HomepageSectionSchema.parse(invalid)).toThrow();
  });

  it('accepts every documented section type', () => {
    const types = [
      'hero_slider',
      'category_tiles',
      'best_sellers',
      'how_it_works',
      'featured_collection',
      'products_in_motion',
      'reviews_testimonials',
      'why_us',
      'offer_strip',
      'recently_viewed',
    ];
    for (const type of types) {
      expect(() => HomepageSectionSchema.parse({ ...validSection, type })).not.toThrow();
    }
  });
});

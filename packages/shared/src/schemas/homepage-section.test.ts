import { describe, it, expect } from 'vitest';
import { HomepageSectionSchema, HeroSlideSchema } from './homepage-section';

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

  it('accepts a section with heroSlides and previewToken', () => {
    const withExtras = {
      ...validSection,
      heroSlides: [{ id: 'slide_1', image: '/a.jpg', mobileImage: '/a-m.jpg', title: 'Slide 1', sortOrder: 0 }],
      previewToken: 'abc123',
    };
    expect(HomepageSectionSchema.parse(withExtras)).toEqual(withExtras);
  });

  it('omits heroSlides and previewToken when not given (no defaulting)', () => {
    const parsed = HomepageSectionSchema.parse(validSection);
    expect('heroSlides' in parsed).toBe(false);
    expect('previewToken' in parsed).toBe(false);
  });
});

describe('HeroSlideSchema', () => {
  it('accepts a slide with only the required fields', () => {
    const slide = { id: 's1', image: '/a.jpg', mobileImage: '/a-m.jpg', title: 'Slide', sortOrder: 0 };
    expect(HeroSlideSchema.parse(slide)).toEqual(slide);
  });

  it('rejects a slide missing a required field', () => {
    const slide = { id: 's1', image: '/a.jpg', mobileImage: '/a-m.jpg', sortOrder: 0 };
    expect(() => HeroSlideSchema.parse(slide)).toThrow();
  });
});

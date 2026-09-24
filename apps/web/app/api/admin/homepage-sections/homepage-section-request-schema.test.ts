import { describe, it, expect } from 'vitest';
import { CreateHomepageSectionBodySchema, UpdateHomepageSectionBodySchema, ReorderHomepageSectionsBodySchema } from './homepage-section-request-schema';

describe('CreateHomepageSectionBodySchema', () => {
  it('accepts a minimal body and fills in defaults', () => {
    const result = CreateHomepageSectionBodySchema.parse({ type: 'offer_strip', title: 'Diwali Sale' });
    expect(result).toMatchObject({ type: 'offer_strip', title: 'Diwali Sale', subtitle: '', isActive: true, sortOrder: 0, startsAt: null, endsAt: null, config: {} });
  });

  it('rejects an unknown field', () => {
    expect(CreateHomepageSectionBodySchema.safeParse({ type: 'offer_strip', title: 'x', notAField: 1 }).success).toBe(false);
  });

  it('rejects an unknown section type', () => {
    expect(CreateHomepageSectionBodySchema.safeParse({ type: 'random_banner', title: 'x' }).success).toBe(false);
  });

  it('transforms ISO datetime strings into Dates', () => {
    const result = CreateHomepageSectionBodySchema.parse({ type: 'offer_strip', title: 'x', startsAt: '2026-10-01T00:00:00.000Z' });
    expect(result.startsAt).toEqual(new Date('2026-10-01T00:00:00.000Z'));
  });

  it('accepts explicit null for startsAt/endsAt', () => {
    const result = CreateHomepageSectionBodySchema.parse({ type: 'offer_strip', title: 'x', startsAt: null, endsAt: null });
    expect(result.startsAt).toBeNull();
    expect(result.endsAt).toBeNull();
  });

  it('accepts a hero_slider section with heroSlides', () => {
    const heroSlides = [{ id: 's1', image: '/a.jpg', mobileImage: '/a-m.jpg', title: 'Slide', sortOrder: 0 }];
    const result = CreateHomepageSectionBodySchema.parse({ type: 'hero_slider', title: 'Hero', heroSlides });
    expect(result.heroSlides).toEqual(heroSlides);
  });

  it('rejects a hero slide missing a required field', () => {
    const heroSlides = [{ id: 's1', image: '/a.jpg', mobileImage: '/a-m.jpg', sortOrder: 0 }];
    expect(CreateHomepageSectionBodySchema.safeParse({ type: 'hero_slider', title: 'Hero', heroSlides }).success).toBe(false);
  });
});

describe('UpdateHomepageSectionBodySchema', () => {
  it('accepts a partial body with a single field', () => {
    const result = UpdateHomepageSectionBodySchema.parse({ title: 'New Title' });
    expect(result).toEqual({ title: 'New Title' });
  });

  it('rejects an unknown field via strict()', () => {
    expect(UpdateHomepageSectionBodySchema.safeParse({ notAField: 1 }).success).toBe(false);
  });
});

describe('ReorderHomepageSectionsBodySchema', () => {
  it('accepts a non-empty array of ids', () => {
    expect(ReorderHomepageSectionsBodySchema.parse({ orderedIds: ['a', 'b'] })).toEqual({ orderedIds: ['a', 'b'] });
  });

  it('rejects an empty array', () => {
    expect(ReorderHomepageSectionsBodySchema.safeParse({ orderedIds: [] }).success).toBe(false);
  });
});

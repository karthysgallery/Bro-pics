import { describe, it, expect } from 'vitest';
import { ProductSchema } from './product';

const validProduct = {
  id: 'prod_1',
  title: 'Classic Wooden Frame',
  slug: 'classic-wooden-frame',
  categoryId: 'cat_frames',
  shortDesc: 'A classic wooden photo frame',
  descriptionHtml: '<p>Details</p>',
  highlights: ['Solid wood', 'Handcrafted'],
  howItWorks: ['Upload', 'Adjust', 'Order'],
  careText: 'Wipe with a dry cloth',
  basePrice: 99900,
  isActive: true,
  isFeatured: false,
  badges: ['best-seller'],
  dispatchDaysMin: 3,
  dispatchDaysMax: 5,
  photoSlots: 1,
  allowsTextPersonalization: false,
  seo: { title: 'Classic Wooden Frame', description: 'Buy now' },
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  availableSizes: ['8x12 in', '12x18 in'],
  availableColours: ['Black', 'White'],
  availableMaterials: ['Wood'],
  minPrice: 79900,
  maxPrice: 129900,
  occasionTags: ['birthday', 'anniversary'],
  inStock: true,
  ratingAverage: 4.5,
  ratingCount: 12,
  titleLower: 'classic wooden frame',
  searchTokens: ['classic', 'wooden', 'frame'],
  faq: [{ question: 'Does this frame come pre-assembled?', answer: 'Yes, it arrives ready to hang or stand.' }],
  primaryImageUrl: '/placeholders/products/classic-wooden-frame-1.svg',
  hoverImageUrl: '/placeholders/products/classic-wooden-frame-2.svg',
};

describe('ProductSchema', () => {
  it('accepts a valid product', () => {
    expect(ProductSchema.parse(validProduct)).toEqual(validProduct);
  });

  it('rejects a non-integer basePrice', () => {
    const invalid = { ...validProduct, basePrice: 999.5 };
    expect(() => ProductSchema.parse(invalid)).toThrow();
  });

  it('rejects a negative photoSlots', () => {
    const invalid = { ...validProduct, photoSlots: 0 };
    expect(() => ProductSchema.parse(invalid)).toThrow();
  });

  it('rejects a ratingAverage above 5', () => {
    const invalid = { ...validProduct, ratingAverage: 5.1 };
    expect(() => ProductSchema.parse(invalid)).toThrow();
  });

  it('rejects a non-integer minPrice', () => {
    const invalid = { ...validProduct, minPrice: 799.5 };
    expect(() => ProductSchema.parse(invalid)).toThrow();
  });

  it('defaults occasionTags to an empty array when omitted', () => {
    const { occasionTags, ...withoutOccasionTags } = validProduct;
    const parsed = ProductSchema.parse(withoutOccasionTags);
    expect(parsed.occasionTags).toEqual([]);
  });

  it('accepts a product with an empty faq array and null hoverImageUrl', () => {
    const noFaq = { ...validProduct, faq: [], hoverImageUrl: null };
    expect(ProductSchema.parse(noFaq)).toEqual(noFaq);
  });

  it('rejects a faq entry missing an answer', () => {
    const invalid = { ...validProduct, faq: [{ question: 'Only a question?' }] };
    expect(() => ProductSchema.parse(invalid)).toThrow();
  });

  it('rejects an empty primaryImageUrl', () => {
    const invalid = { ...validProduct, primaryImageUrl: '' };
    expect(() => ProductSchema.parse(invalid)).toThrow();
  });
});

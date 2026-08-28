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
});

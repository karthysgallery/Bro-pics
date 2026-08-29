// scripts/seed/src/data.test.ts
import { describe, it, expect } from 'vitest';
import { CategorySchema, ProductSchema, VariantSchema, ReviewSchema, HomepageSectionSchema } from '@bro-pics/shared';
import { seedCategories, seedProducts, seedVariants, seedReviews, seedHomepageSections } from './data';

describe('seed categories', () => {
  it('every seed category passes CategorySchema validation', () => {
    for (const category of seedCategories) {
      expect(() => CategorySchema.parse(category)).not.toThrow();
    }
  });

  it('seeds at least 3 categories', () => {
    expect(seedCategories.length).toBeGreaterThanOrEqual(3);
  });

  it('every child category references a parentId that exists', () => {
    const categoryIds = new Set(seedCategories.map((c) => c.id));
    for (const category of seedCategories) {
      if (category.parentId !== null) {
        expect(categoryIds.has(category.parentId)).toBe(true);
      }
    }
  });
});

describe('seed products', () => {
  it('every seed product passes ProductSchema validation', () => {
    for (const product of seedProducts) {
      expect(() => ProductSchema.parse(product)).not.toThrow();
    }
  });

  it('seeds at least 8 products', () => {
    expect(seedProducts.length).toBeGreaterThanOrEqual(8);
  });

  it('every product references a categoryId that exists in seedCategories', () => {
    const categoryIds = new Set(seedCategories.map((c) => c.id));
    for (const product of seedProducts) {
      expect(categoryIds.has(product.categoryId)).toBe(true);
    }
  });

  it('every product\'s denormalized fields are consistent with its own variants', () => {
    for (const product of seedProducts) {
      const productVariants = seedVariants.filter((v) => v.productId === product.id && v.isActive);
      const prices = productVariants.map((v) => v.price);
      expect(product.minPrice).toBe(Math.min(...prices));
      expect(product.maxPrice).toBe(Math.max(...prices));
      expect(product.availableSizes.sort()).toEqual(
        [...new Set(productVariants.map((v) => v.sizeLabel))].sort()
      );
    }
  });

  it('every product has a titleLower matching its lowercased title', () => {
    for (const product of seedProducts) {
      expect(product.titleLower).toBe(product.title.toLowerCase());
    }
  });
});

describe('seed variants', () => {
  it('every seed variant passes VariantSchema validation', () => {
    for (const variant of seedVariants) {
      expect(() => VariantSchema.parse(variant)).not.toThrow();
    }
  });

  it('every variant references a product that exists in seedProducts', () => {
    const productIds = new Set(seedProducts.map((p) => p.id));
    for (const variant of seedVariants) {
      expect(productIds.has(variant.productId)).toBe(true);
    }
  });
});

describe('seed reviews', () => {
  it('every seed review passes ReviewSchema validation', () => {
    for (const review of seedReviews) {
      expect(() => ReviewSchema.parse(review)).not.toThrow();
    }
  });

  it('every review references a product that exists in seedProducts', () => {
    const productIds = new Set(seedProducts.map((p) => p.id));
    for (const review of seedReviews) {
      expect(productIds.has(review.productId)).toBe(true);
    }
  });
});

describe('seed homepage sections', () => {
  it('every seed section passes HomepageSectionSchema validation', () => {
    for (const section of seedHomepageSections) {
      expect(() => HomepageSectionSchema.parse(section)).not.toThrow();
    }
  });

  it('sortOrder values are unique', () => {
    const orders = seedHomepageSections.map((s) => s.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

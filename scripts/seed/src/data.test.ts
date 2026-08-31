// scripts/seed/src/data.test.ts
import { describe, it, expect } from 'vitest';
import { CategorySchema, ProductSchema, VariantSchema, ReviewSchema, HomepageSectionSchema, ProductMediaSchema } from '@bro-pics/shared';
import { seedCategories, seedProducts, seedVariants, seedReviews, seedHomepageSections, seedProductMedia } from './data';

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
      expect(product.availableColours.sort()).toEqual(
        [...new Set(productVariants.map((v) => v.frameColour))].sort()
      );
      expect(product.availableMaterials.sort()).toEqual(
        [...new Set(productVariants.map((v) => v.material))].sort()
      );
      expect(product.inStock).toBe(productVariants.some((v) => v.stockStatus === 'in_stock'));
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

describe('seed product media', () => {
  it('every seed media doc passes ProductMediaSchema validation', () => {
    for (const media of seedProductMedia) {
      expect(() => ProductMediaSchema.parse(media)).not.toThrow();
    }
  });

  it('every media doc references a product that exists in seedProducts', () => {
    const productIds = new Set(seedProducts.map((p) => p.id));
    for (const media of seedProductMedia) {
      expect(productIds.has(media.productId)).toBe(true);
    }
  });

  it('every media doc with a non-null variantId references a variant that exists in seedVariants', () => {
    const variantIds = new Set(seedVariants.map((v) => v.id));
    for (const media of seedProductMedia) {
      if (media.variantId !== null) {
        expect(variantIds.has(media.variantId)).toBe(true);
      }
    }
  });

  it("every product's primaryImageUrl/hoverImageUrl match its own variant-agnostic image media, sorted by sortOrder", () => {
    for (const product of seedProducts) {
      const cardImages = seedProductMedia
        .filter((m) => m.productId === product.id && m.variantId === null && m.type === 'image')
        .sort((a, b) => a.sortOrder - b.sortOrder);
      expect(product.primaryImageUrl).toBe(cardImages[0]?.url ?? '');
      expect(product.hoverImageUrl).toBe(cardImages[1]?.url ?? null);
    }
  });

  it('at least one product has variant-specific media for some but not all of its active variants (exercises the gallery fallback rule)', () => {
    const hasPartialVariantMedia = seedProducts.some((product) => {
      const productVariantIds = seedVariants.filter((v) => v.productId === product.id && v.isActive).map((v) => v.id);
      const variantIdsWithMedia = new Set(
        seedProductMedia.filter((m) => m.productId === product.id && m.variantId !== null).map((m) => m.variantId)
      );
      return variantIdsWithMedia.size > 0 && variantIdsWithMedia.size < productVariantIds.length;
    });
    expect(hasPartialVariantMedia).toBe(true);
  });

  it('at least one product has video media', () => {
    expect(seedProductMedia.some((m) => m.type === 'video')).toBe(true);
  });
});

describe('seed products faq and reviews', () => {
  it('every product has at least one FAQ entry', () => {
    for (const product of seedProducts) {
      expect(product.faq.length).toBeGreaterThan(0);
    }
  });

  it('every review has a createdAt date', () => {
    for (const review of seedReviews) {
      expect(review.createdAt).toBeInstanceOf(Date);
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

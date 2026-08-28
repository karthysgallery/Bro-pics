import { describe, it, expect } from 'vitest';
import { ProductSchema, VariantSchema } from '@bro-pics/shared';
import { seedProducts, seedVariants } from './data';

describe('seed data', () => {
  it('every seed product passes ProductSchema validation', () => {
    for (const product of seedProducts) {
      expect(() => ProductSchema.parse(product)).not.toThrow();
    }
  });

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

  it('seeds at least one product', () => {
    expect(seedProducts.length).toBeGreaterThan(0);
  });
});

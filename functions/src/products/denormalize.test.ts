import { describe, it, expect } from 'vitest';
import { calculateDenormalizedFields } from './denormalize';
import type { VariantForDenormalization } from './denormalize';

function makeVariant(overrides: Partial<VariantForDenormalization> = {}): VariantForDenormalization {
  return {
    price: 79900,
    sizeLabel: '8x12 in',
    frameColour: 'Black',
    material: 'Wood',
    stockStatus: 'in_stock',
    isActive: true,
    ...overrides,
  };
}

describe('calculateDenormalizedFields', () => {
  it('collects unique sizes, colours, and materials from active variants', () => {
    const result = calculateDenormalizedFields([
      makeVariant({ sizeLabel: '8x12 in', frameColour: 'Black', material: 'Wood' }),
      makeVariant({ sizeLabel: '12x18 in', frameColour: 'White', material: 'Wood' }),
      makeVariant({ sizeLabel: '8x12 in', frameColour: 'Black', material: 'Wood' }), // duplicate
    ]);
    expect(result.availableSizes.sort()).toEqual(['12x18 in', '8x12 in']);
    expect(result.availableColours.sort()).toEqual(['Black', 'White']);
    expect(result.availableMaterials).toEqual(['Wood']);
  });

  it('excludes inactive variants from every field', () => {
    const result = calculateDenormalizedFields([
      makeVariant({ sizeLabel: '8x12 in', isActive: true }),
      makeVariant({ sizeLabel: '20x30 in', isActive: false }),
    ]);
    expect(result.availableSizes).toEqual(['8x12 in']);
  });

  it('computes minPrice and maxPrice from active variants only', () => {
    const result = calculateDenormalizedFields([
      makeVariant({ price: 79900, isActive: true }),
      makeVariant({ price: 129900, isActive: true }),
      makeVariant({ price: 999900, isActive: false }),
    ]);
    expect(result.minPrice).toBe(79900);
    expect(result.maxPrice).toBe(129900);
  });

  it('sets inStock true when any active variant is in_stock', () => {
    const result = calculateDenormalizedFields([
      makeVariant({ stockStatus: 'out_of_stock' }),
      makeVariant({ stockStatus: 'in_stock' }),
    ]);
    expect(result.inStock).toBe(true);
  });

  it('sets inStock false when no active variant is in_stock', () => {
    const result = calculateDenormalizedFields([
      makeVariant({ stockStatus: 'out_of_stock' }),
      makeVariant({ stockStatus: 'backorder' }),
    ]);
    expect(result.inStock).toBe(false);
  });

  it('returns zeroed fields for an empty variant list', () => {
    const result = calculateDenormalizedFields([]);
    expect(result).toEqual({
      availableSizes: [],
      availableColours: [],
      availableMaterials: [],
      minPrice: 0,
      maxPrice: 0,
      inStock: false,
    });
  });
});

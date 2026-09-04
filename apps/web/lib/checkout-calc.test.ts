import { describe, it, expect } from 'vitest';
import { priceCartLines, calculateSubtotal, calculateShipping } from './checkout-calc';
import type { Variant } from '@bro-pics/shared';

function makeVariant(overrides: Partial<Variant> = {}): Variant {
  return {
    id: 'var_1',
    productId: 'prod_1',
    sku: 'SKU1',
    sizeLabel: '8x12',
    widthIn: 8,
    heightIn: 12,
    frameColour: 'walnut',
    material: 'wood',
    price: 79900,
    stockStatus: 'in_stock',
    printWidthPx: 2400,
    printHeightPx: 3600,
    minUploadPx: 2400,
    aspectRatio: 8 / 12,
    isActive: true,
    ...overrides,
  };
}

const cartLine = {
  variantId: 'var_1',
  personalizationId: 'pers_1',
  title: 'Classic Wooden Frame — 8x12 in',
  qty: 2,
  previewUrl: 'https://example.com/preview.png',
};

describe('priceCartLines', () => {
  it('prices a line from the variant, ignoring any client-supplied price', () => {
    const variantsById = new Map([['var_1', makeVariant({ price: 79900 })]]);
    const { priced, unavailable } = priceCartLines([cartLine], variantsById);
    expect(unavailable).toEqual([]);
    expect(priced).toEqual([
      {
        variantId: 'var_1',
        productId: 'prod_1',
        personalizationId: 'pers_1',
        title: 'Classic Wooden Frame — 8x12 in',
        unitPrice: 79900,
        qty: 2,
        previewUrl: 'https://example.com/preview.png',
      },
    ]);
  });

  it('defaults previewUrl to null when the cart line has none', () => {
    const variantsById = new Map([['var_1', makeVariant()]]);
    const { previewUrl: _drop, ...lineWithoutPreview } = cartLine;
    const { priced } = priceCartLines([lineWithoutPreview], variantsById);
    expect(priced[0].previewUrl).toBeNull();
  });

  it('flags a line as unavailable when the variant is not found', () => {
    const { priced, unavailable } = priceCartLines([cartLine], new Map());
    expect(priced).toEqual([]);
    expect(unavailable).toEqual([{ variantId: 'var_1', reason: 'not_found' }]);
  });

  it('flags a line as unavailable when the variant is inactive', () => {
    const variantsById = new Map([['var_1', makeVariant({ isActive: false })]]);
    const { unavailable } = priceCartLines([cartLine], variantsById);
    expect(unavailable).toEqual([{ variantId: 'var_1', reason: 'inactive' }]);
  });

  it('flags a line as unavailable when the variant is out of stock', () => {
    const variantsById = new Map([['var_1', makeVariant({ stockStatus: 'out_of_stock' })]]);
    const { unavailable } = priceCartLines([cartLine], variantsById);
    expect(unavailable).toEqual([{ variantId: 'var_1', reason: 'out_of_stock' }]);
  });

  it('collects every unavailable line, not just the first', () => {
    const variantsById = new Map([['var_2', makeVariant({ id: 'var_2', stockStatus: 'out_of_stock' })]]);
    const lines = [cartLine, { ...cartLine, variantId: 'var_2', personalizationId: 'pers_2' }];
    const { unavailable } = priceCartLines(lines, variantsById);
    expect(unavailable).toEqual([
      { variantId: 'var_1', reason: 'not_found' },
      { variantId: 'var_2', reason: 'out_of_stock' },
    ]);
  });
});

describe('calculateSubtotal', () => {
  it('sums unitPrice * qty across all priced lines', () => {
    const priced = [
      { variantId: 'v1', productId: 'p1', personalizationId: 'pers_1', title: 'A', unitPrice: 1000, qty: 2, previewUrl: null },
      { variantId: 'v2', productId: 'p2', personalizationId: 'pers_2', title: 'B', unitPrice: 500, qty: 3, previewUrl: null },
    ];
    expect(calculateSubtotal(priced)).toBe(1000 * 2 + 500 * 3);
  });

  it('returns 0 for an empty list', () => {
    expect(calculateSubtotal([])).toBe(0);
  });
});

describe('calculateShipping', () => {
  const settings = { freeShippingThreshold: 150000, flatShippingCharge: 5000 };

  it('charges the flat rate below the free-shipping threshold', () => {
    expect(calculateShipping(100000, settings)).toBe(5000);
  });

  it('is free at or above the threshold', () => {
    expect(calculateShipping(150000, settings)).toBe(0);
    expect(calculateShipping(200000, settings)).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { priceCartLines, calculateSubtotal } from './checkout-calc';
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
  previewPath: 'uploads/sess_1/previews/pers_1/slot-0.png',
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
        previewPath: 'uploads/sess_1/previews/pers_1/slot-0.png',
        // Variant details frozen onto the order line at purchase time.
        sku: 'SKU1',
        sizeLabel: '8x12',
        frameColour: 'walnut',
        material: 'wood',
        widthIn: 8,
        heightIn: 12,
      },
    ]);
  });

  it('defaults previewPath to null when the cart line has none', () => {
    const variantsById = new Map([['var_1', makeVariant()]]);
    const { previewPath: _drop, ...lineWithoutPreview } = cartLine;
    const { priced } = priceCartLines([lineWithoutPreview], variantsById);
    expect(priced[0].previewPath).toBeNull();
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
    const snapshot = { sku: 'SKU', sizeLabel: '8x12', frameColour: 'Black', material: 'Wood', widthIn: 8, heightIn: 12 };
    const priced = [
      { variantId: 'v1', productId: 'p1', personalizationId: 'pers_1', title: 'A', unitPrice: 1000, qty: 2, previewPath: null, ...snapshot },
      { variantId: 'v2', productId: 'p2', personalizationId: 'pers_2', title: 'B', unitPrice: 500, qty: 3, previewPath: null, ...snapshot },
    ];
    expect(calculateSubtotal(priced)).toBe(1000 * 2 + 500 * 3);
  });

  it('returns 0 for an empty list', () => {
    expect(calculateSubtotal([])).toBe(0);
  });
});

describe('priceCartLines — glitter finish', () => {
  const variantsById = new Map([['var_1', makeVariant({ price: 79900 })]]);
  const glitterLine = { ...cartLine, finish: 'glitter' as const };

  it('adds the product\'s glitter extra to the unit price and records the finish', () => {
    const { priced, unavailable } = priceCartLines([glitterLine], variantsById, new Map([['prod_1', 10000]]));
    expect(unavailable).toEqual([]);
    expect(priced[0]).toMatchObject({ unitPrice: 89900, finish: 'glitter', finishExtra: 10000 });
  });

  it('never trusts a price from the cart: the extra comes only from the product map', () => {
    const { priced } = priceCartLines([{ ...glitterLine, finishExtra: 1 } as never], variantsById, new Map([['prod_1', 10000]]));
    expect(priced[0]!.unitPrice).toBe(89900);
  });

  it('refuses glitter on a product that does not offer it (or stopped offering it)', () => {
    const { priced, unavailable } = priceCartLines([glitterLine], variantsById);
    expect(priced).toEqual([]);
    expect(unavailable).toEqual([{ variantId: 'var_1', reason: 'finish_unavailable' }]);
  });

  it('leaves a normal (matte) line exactly as before, even when the product offers glitter', () => {
    const { priced } = priceCartLines([cartLine], variantsById, new Map([['prod_1', 10000]]));
    expect(priced[0]!.unitPrice).toBe(79900);
    expect(priced[0]).not.toHaveProperty('finish');
  });
});

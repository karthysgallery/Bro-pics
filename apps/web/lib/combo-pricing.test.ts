import { describe, it, expect } from 'vitest';
import { ComboSchema, comboVariantId, expandComboFrames, type Combo, type Variant } from '@bro-pics/shared';
import { priceComboLines, isComboLine, type ComboPricingDeps } from './combo-pricing';
import type { CartLineInput } from './checkout-calc';

const combo: Combo = ComboSchema.parse({
  id: 'triple-9', slug: 'triple-9', name: 'Triple 9 Combo', status: 'published', price: 99900, mrp: 199900, version: 2,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  items: [
    { id: 'small', productId: 'p_small', variantId: 'v_small', quantity: 2 },
    { id: 'large', productId: 'p_large', variantId: 'v_large', quantity: 1 },
  ],
});

const variant = (id: string, productId: string, price: number, over: Partial<Variant> = {}): Variant =>
  ({ id, productId, sku: id.toUpperCase(), sizeLabel: '8x12 in', frameColour: 'Black', material: 'Wood', widthIn: 8, heightIn: 12, price, isActive: true, stockStatus: 'in_stock', ...over }) as Variant;

const variants: Record<string, Variant> = { v_small: variant('v_small', 'p_small', 40000), v_large: variant('v_large', 'p_large', 80000) };

function deps(over: Partial<ComboPricingDeps> = {}, c: Combo | null = combo): ComboPricingDeps {
  return { loadCombo: async () => c, loadVariant: async (id) => variants[id] ?? null, isProductAvailable: async () => true, ...over };
}

function line(over: Partial<CartLineInput> = {}, version = 2): CartLineInput {
  return {
    variantId: comboVariantId('triple-9'), personalizationId: 'inst_1', title: 'Triple 9 Combo', qty: 1,
    combo: {
      comboId: 'triple-9', version, name: 'Triple 9 Combo',
      frames: expandComboFrames(combo).map((f) => ({ key: f.key, productId: f.productId, variantId: f.variantId, personalizationId: `pers_${f.key}`, previewPath: `uploads/s/${f.key}.png` })),
    },
    ...over,
  };
}

describe('priceComboLines', () => {
  it('turns one combo line into one priced line per frame whose prices add up to exactly the combo price', async () => {
    const out = await priceComboLines([line()], deps());
    expect(out.unavailable).toEqual([]);
    expect(out.priced).toHaveLength(3);
    expect(out.priced.reduce((n, l) => n + l.unitPrice * l.qty, 0)).toBe(99900);
    // weighted by each frame's own price: 40000 : 40000 : 80000 of 99900
    expect(out.priced.map((l) => l.unitPrice)).toEqual([24975, 24975, 49950]);
    expect(out.priced[0]).toMatchObject({
      variantId: 'v_small', productId: 'p_small', personalizationId: 'pers_small-1', qty: 1, previewPath: 'uploads/s/small-1.png',
      combo: { instanceId: 'inst_1', comboId: 'triple-9', comboName: 'Triple 9 Combo', frameKey: 'small-1', frameLabel: 'Frame 1' },
    });
    expect(out.combos).toEqual([expect.objectContaining({ instanceId: 'inst_1', comboId: 'triple-9', price: 99900, mrp: 199900, couponsAllowed: false })]);
  });

  it('charges the catalogue price, never anything the cart says', async () => {
    const tampered = line({ unitPriceSnapshot: 1 } as Partial<CartLineInput>);
    const out = await priceComboLines([tampered], deps());
    expect(out.priced.reduce((n, l) => n + l.unitPrice, 0)).toBe(99900);
  });

  it('refuses a combo that is gone, unpublished, edited since it was added, or no longer matches', async () => {
    expect((await priceComboLines([line()], deps({}, null))).unavailable).toEqual([{ variantId: 'combo:triple-9', reason: 'combo_unavailable' }]);
    expect((await priceComboLines([line()], deps({}, { ...combo, status: 'draft' }))).unavailable[0]?.reason).toBe('combo_unavailable');
    expect((await priceComboLines([line({}, 1)], deps())).unavailable[0]?.reason).toBe('combo_changed');
    const missingFrame = line();
    missingFrame.combo!.frames = missingFrame.combo!.frames.slice(1);
    expect((await priceComboLines([missingFrame], deps())).unavailable[0]?.reason).toBe('combo_invalid');
    expect((await priceComboLines([{ ...line(), combo: undefined }], deps())).unavailable[0]?.reason).toBe('combo_invalid');
  });

  it('refuses a combo when any one frame is out of stock, inactive, or its product is off sale', async () => {
    expect((await priceComboLines([line()], deps({ loadVariant: async (id) => (id === 'v_large' ? { ...variants.v_large!, stockStatus: 'out_of_stock' } : variants[id] ?? null) }))).unavailable)
      .toEqual([{ variantId: 'v_large', reason: 'out_of_stock' }]);
    expect((await priceComboLines([line()], deps({ loadVariant: async (id) => (id === 'v_small' ? { ...variants.v_small!, isActive: false } : variants[id] ?? null) }))).unavailable.map((u) => u.reason))
      .toEqual(['inactive', 'inactive']);
    expect((await priceComboLines([line()], deps({ isProductAvailable: async (id) => id !== 'p_large' }))).unavailable)
      .toEqual([{ variantId: 'v_large', reason: 'inactive' }]);
    // A variant that now belongs to a different product is not what the combo promised.
    expect((await priceComboLines([line()], deps({ loadVariant: async (id) => (id === 'v_small' ? { ...variants.v_small!, productId: 'other' } : variants[id] ?? null) }))).unavailable[0]?.reason).toBe('not_found');
  });

  it('prices several combos in one cart independently', async () => {
    const a = line();
    const b = { ...line(), personalizationId: 'inst_2' };
    b.combo = { ...b.combo!, frames: b.combo!.frames.map((f) => ({ ...f, personalizationId: `${f.personalizationId}_b` })) };
    const out = await priceComboLines([a, b], deps());
    expect(out.priced).toHaveLength(6);
    expect(out.combos.map((c) => c.instanceId)).toEqual(['inst_1', 'inst_2']);
  });
});

describe('isComboLine', () => {
  it('recognises a combo cart line by its id prefix only', () => {
    expect(isComboLine({ variantId: 'combo:triple-9' })).toBe(true);
    expect(isComboLine({ variantId: 'var_classic_wooden_frame_12x18_black' })).toBe(false);
  });
});

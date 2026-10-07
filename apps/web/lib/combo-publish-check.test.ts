import { describe, it, expect } from 'vitest';
import type { Variant } from '@bro-pics/shared';
import { checkComboPublishable, type ComboPublishDeps } from './combo-publish-check';

const variant = (id: string, productId: string, over: Partial<Variant> = {}): Variant =>
  ({ id, productId, sku: id, sizeLabel: '8x12 in', frameColour: 'Black', material: 'Wood', widthIn: 8, heightIn: 12, price: 50000, isActive: true, stockStatus: 'in_stock', ...over }) as Variant;

const combo = {
  name: 'Triple 9', coverImageUrl: '/cover.jpg', price: 99900, mrp: 199900,
  items: [
    { id: 'small', productId: 'p1', variantId: 'v1', quantity: 2 },
    { id: 'large', productId: 'p2', variantId: 'v2', quantity: 1, label: 'Large frame' },
  ],
};

function deps(over: Partial<ComboPublishDeps> = {}): ComboPublishDeps {
  return {
    loadProduct: async (id) => ({ title: `Product ${id}`, isActive: true }),
    loadVariant: async (id) => variant(id, id === 'v1' ? 'p1' : 'p2'),
    hasFrameTemplate: async () => true,
    hasPublishedTemplate: async () => true,
    ...over,
  };
}

describe('checkComboPublishable', () => {
  it('has nothing to say about a combo whose every frame can be bought and personalized', async () => {
    expect(await checkComboPublishable(combo, deps())).toEqual([]);
  });

  it('asks for a name, a cover image and a sensible price', async () => {
    const problems = await checkComboPublishable({ ...combo, name: ' ', coverImageUrl: '', price: 300000 }, deps());
    expect(problems.map((p) => p.message)).toEqual(expect.arrayContaining(['Give the combo a name.', 'Add a cover image.', 'The combo price cannot be higher than the MRP.']));
  });

  it('names the item and says why when a product is gone, off sale, switched off or out of stock', async () => {
    expect(await checkComboPublishable(combo, deps({ loadProduct: async (id) => (id === 'p1' ? null : { title: 'P2', isActive: true }) })))
      .toEqual([{ itemId: 'small', message: 'This product no longer exists.' }]);
    expect(await checkComboPublishable(combo, deps({ loadProduct: async (id) => ({ title: `Product ${id}`, isActive: id !== 'p2' }) })))
      .toEqual([{ itemId: 'large', message: 'Large frame is not on sale.' }]);
    expect(await checkComboPublishable(combo, deps({ loadVariant: async (id) => variant(id, id === 'v1' ? 'p1' : 'p2', id === 'v2' ? { isActive: false } : {}) })))
      .toEqual([{ itemId: 'large', message: 'Large frame (8x12 in) is switched off.' }]);
    expect(await checkComboPublishable(combo, deps({ loadVariant: async (id) => variant(id, id === 'v1' ? 'p1' : 'p2', id === 'v1' ? { stockStatus: 'out_of_stock' } : {}) })))
      .toEqual([{ itemId: 'small', message: 'Product p1 (8x12 in) is out of stock.' }]);
  });

  it('refuses a size that now belongs to a different product', async () => {
    const problems = await checkComboPublishable(combo, deps({ loadVariant: async (id) => variant(id, 'someone_else') }));
    expect(problems).toHaveLength(2);
    expect(problems[0]!.message).toMatch(/chosen size no longer exists/);
  });

  it('refuses a frame customers could not personalize (no frame template, or no published collage template)', async () => {
    expect(await checkComboPublishable(combo, deps({ hasFrameTemplate: async (id) => id !== 'v1' })))
      .toEqual([{ itemId: 'small', message: 'Product p1 (8x12 in) has no photo template yet, so customers couldn\'t personalize it.' }]);
    // A variant that points at a collage-engine template needs that template to be published instead.
    const viaTemplate = await checkComboPublishable(combo, deps({
      loadVariant: async (id) => ({ ...variant(id, id === 'v1' ? 'p1' : 'p2'), personalizationTemplateId: id === 'v2' ? 'trio' : null }) as Variant,
      hasPublishedTemplate: async () => false,
    }));
    expect(viaTemplate).toEqual([{ itemId: 'large', message: 'Large frame (8x12 in) has no photo template yet, so customers couldn\'t personalize it.' }]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  ComboSchema,
  allocateComboPrice,
  comboProgress,
  comboSavings,
  comboVariantId,
  expandComboFrames,
  validateComboCart,
  type Combo,
  type CartCombo,
} from './combo';

const combo: Combo = ComboSchema.parse({
  id: 'triple-9',
  slug: 'triple-9-combo',
  name: 'Triple 9 Combo – 10 Frames',
  status: 'published',
  price: 299900,
  mrp: 499900,
  version: 3,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  items: [
    { id: 'small', productId: 'p_small', variantId: 'v_small', quantity: 2 },
    { id: 'medium', productId: 'p_med', variantId: 'v_med', quantity: 3 },
    { id: 'large', productId: 'p_large', variantId: 'v_large', quantity: 3 },
    { id: 'a4', productId: 'p_a4', variantId: 'v_a4', quantity: 2 },
  ],
});

const cartFor = (over: Partial<CartCombo> = {}): CartCombo => ({
  comboId: 'triple-9',
  version: 3,
  name: combo.name,
  frames: expandComboFrames(combo).map((f) => ({ key: f.key, productId: f.productId, variantId: f.variantId, personalizationId: `pers_${f.key}` })),
  ...over,
});

describe('combo definition', () => {
  it('computes the savings the customer sees', () => {
    expect(comboSavings(combo)).toEqual({ amount: 200000, percent: 40 });
    expect(comboSavings({ price: 500, mrp: 400 })).toEqual({ amount: 0, percent: 0 });
  });

  it('rejects an MRP below the price, duplicate item ids and oversized combos', () => {
    expect(() => ComboSchema.parse({ ...combo, mrp: 100 })).toThrow(/MRP/);
    expect(() => ComboSchema.parse({ ...combo, items: [combo.items[0], { ...combo.items[1], id: 'small' }] })).toThrow(/own id/);
    expect(() => ComboSchema.parse({ ...combo, items: [{ ...combo.items[0], quantity: 30 }, { ...combo.items[1], quantity: 11 }] })).toThrow(/at most 40/);
  });

  it('expands "Small × 2, Medium × 3, Large × 3, A4 × 2" into ten separately personalized frames', () => {
    const frames = expandComboFrames(combo);
    expect(frames).toHaveLength(10);
    expect(frames.map((f) => f.key)).toEqual(['small-1', 'small-2', 'medium-1', 'medium-2', 'medium-3', 'large-1', 'large-2', 'large-3', 'a4-1', 'a4-2']);
    expect(frames[0]).toMatchObject({ label: 'Frame 1', index: 1, productId: 'p_small', variantId: 'v_small', copy: 1 });
    expect(frames[9]).toMatchObject({ label: 'Frame 10', index: 10, itemId: 'a4', copy: 2 });
  });
});

describe('allocateComboPrice', () => {
  it('always adds up to exactly the combo price, in proportion to each frame’s own price', () => {
    for (const [total, weights] of [
      [299900, [49900, 49900, 79900, 79900, 79900, 129900, 129900, 129900, 39900, 39900]],
      [100, [1, 1, 1]],
      [1, [5, 5, 5]],
      [999999, [333, 667, 1]],
    ] as const) {
      const parts = allocateComboPrice(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts.every((p) => Number.isInteger(p) && p >= 0)).toBe(true);
    }
    expect(allocateComboPrice(300, [1, 2])).toEqual([100, 200]);
    expect(allocateComboPrice(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it('copes with zero weights and no frames', () => {
    expect(allocateComboPrice(10, [0, 0])).toEqual([5, 5]);
    expect(allocateComboPrice(10, [])).toEqual([]);
  });
});

describe('validateComboCart', () => {
  it('accepts a cart line that matches the combo exactly', () => {
    expect(validateComboCart(combo, cartFor())).toEqual({ ok: true });
  });

  it('flags a different combo, a changed version, missing/extra frames and swapped variants', () => {
    expect(validateComboCart(combo, cartFor({ comboId: 'other' }))).toEqual({ ok: false, issue: 'wrong_combo' });
    expect(validateComboCart(combo, cartFor({ version: 2 }))).toEqual({ ok: false, issue: 'changed' });
    expect(validateComboCart(combo, cartFor({ frames: cartFor().frames.slice(1) }))).toEqual({ ok: false, issue: 'frames_mismatch' });
    const swapped = cartFor();
    swapped.frames[0] = { ...swapped.frames[0]!, variantId: 'v_cheap' };
    expect(validateComboCart(combo, swapped)).toEqual({ ok: false, issue: 'frame_variant_mismatch' });
    const duplicateKey = cartFor();
    duplicateKey.frames[1] = { ...duplicateKey.frames[1]!, key: duplicateKey.frames[0]!.key };
    expect(validateComboCart(combo, duplicateKey)).toEqual({ ok: false, issue: 'frames_mismatch' });
  });

  it('refuses two frames that share one personalization (their photos would be mixed up)', () => {
    const shared = cartFor();
    shared.frames[1] = { ...shared.frames[1]!, personalizationId: shared.frames[0]!.personalizationId };
    expect(validateComboCart(combo, shared)).toEqual({ ok: false, issue: 'duplicate_personalization' });
  });
});

describe('comboProgress', () => {
  it('is ready only when every frame is personalized, and points at the next one to do', () => {
    const none = comboProgress(combo, new Set());
    expect(none).toMatchObject({ doneCount: 0, total: 10, ready: false, nextKey: 'small-1' });
    const some = comboProgress(combo, new Set(['small-1', 'medium-1']));
    expect(some).toMatchObject({ doneCount: 2, ready: false, nextKey: 'small-2' });
    const all = comboProgress(combo, new Set(expandComboFrames(combo).map((f) => f.key)));
    expect(all).toMatchObject({ doneCount: 10, ready: true, nextKey: null });
  });
});

describe('cart line id', () => {
  it('can never collide with a real variant id', () => {
    expect(comboVariantId('triple-9')).toBe('combo:triple-9');
  });
});

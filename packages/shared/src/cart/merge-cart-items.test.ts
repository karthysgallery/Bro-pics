import { describe, it, expect } from 'vitest';
import { mergeCartItems } from './merge-cart-items';

describe('mergeCartItems', () => {
  it('sums qty for matching (variantId, personalizationId) pairs', () => {
    const existing = [{ variantId: 'v1', personalizationId: 'p1', title: 'Frame A', unitPriceSnapshot: 1000, qty: 2 }];
    const incoming = [{ variantId: 'v1', personalizationId: 'p1', title: 'Frame A', unitPriceSnapshot: 1000, qty: 3 }];
    const result = mergeCartItems(existing, incoming);
    expect(result).toEqual([{ variantId: 'v1', personalizationId: 'p1', title: 'Frame A', unitPriceSnapshot: 1000, qty: 5 }]);
  });

  it('keeps non-matching lines from both sides', () => {
    const existing = [{ variantId: 'v1', personalizationId: 'p1', title: 'Frame A', unitPriceSnapshot: 1000, qty: 1 }];
    const incoming = [{ variantId: 'v2', personalizationId: 'p2', title: 'Frame B', unitPriceSnapshot: 2000, qty: 1 }];
    const result = mergeCartItems(existing, incoming);
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([existing[0], incoming[0]]));
  });

  it('prefers the incoming line\'s previewUrl and title when merging', () => {
    const existing = [{ variantId: 'v1', personalizationId: 'p1', title: 'Old Title', unitPriceSnapshot: 1000, qty: 1, previewUrl: 'old.png' }];
    const incoming = [{ variantId: 'v1', personalizationId: 'p1', title: 'New Title', unitPriceSnapshot: 1000, qty: 1, previewUrl: 'new.png' }];
    const result = mergeCartItems(existing, incoming);
    expect(result).toEqual([{ variantId: 'v1', personalizationId: 'p1', title: 'New Title', unitPriceSnapshot: 1000, qty: 2, previewUrl: 'new.png' }]);
  });

  it('returns existing unchanged when incoming is empty', () => {
    const existing = [{ variantId: 'v1', personalizationId: 'p1', title: 'Frame A', unitPriceSnapshot: 1000, qty: 4 }];
    expect(mergeCartItems(existing, [])).toEqual(existing);
  });
});

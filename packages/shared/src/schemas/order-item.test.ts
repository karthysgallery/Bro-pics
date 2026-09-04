import { describe, it, expect } from 'vitest';
import { OrderItemSchema } from './order-item';

function baseOrderItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item_1',
    productId: 'prod_1',
    variantId: 'var_1',
    personalizationId: 'pers_1',
    title: 'Classic Wooden Frame — 8x12 in',
    unitPrice: 79900,
    qty: 2,
    previewUrl: 'https://example.com/preview.png',
    ...overrides,
  };
}

describe('OrderItemSchema', () => {
  it('accepts a full valid order item', () => {
    expect(OrderItemSchema.safeParse(baseOrderItem()).success).toBe(true);
  });

  it('accepts a null previewUrl', () => {
    expect(OrderItemSchema.safeParse(baseOrderItem({ previewUrl: null })).success).toBe(true);
  });

  it('rejects a negative unitPrice', () => {
    expect(OrderItemSchema.safeParse(baseOrderItem({ unitPrice: -100 })).success).toBe(false);
  });

  it('rejects a non-positive qty', () => {
    expect(OrderItemSchema.safeParse(baseOrderItem({ qty: 0 })).success).toBe(false);
  });

  it('rejects a missing personalizationId', () => {
    const { personalizationId: _drop, ...rest } = baseOrderItem();
    expect(OrderItemSchema.safeParse(rest).success).toBe(false);
  });
});

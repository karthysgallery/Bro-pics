import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockFindVariantById = vi.fn();
vi.mock('./variant-lookup', () => ({ findVariantById: (...a: unknown[]) => mockFindVariantById(...a) }));
const mockFindCouponByCode = vi.fn();
vi.mock('./coupon-lookup', () => ({ findCouponByCode: (...a: unknown[]) => mockFindCouponByCode(...a) }));
const mockShipping = vi.fn();
const mockGst = vi.fn();
vi.mock('./firestore-settings', () => ({ getShippingSettings: () => mockShipping(), getGstSettings: () => mockGst() }));

const mockPaidUses = vi.fn();
const ordersQuery: { where: ReturnType<typeof vi.fn>; get: () => unknown } = { where: vi.fn(), get: () => mockPaidUses() };
ordersQuery.where.mockReturnValue(ordersQuery);
const mockProduct = vi.fn();
const db = { collection: (name: string) => (name === 'orders' ? ordersQuery : { doc: (id: string) => ({ get: () => mockProduct(name, id) ?? { exists: false } }) }) } as never;

import { computeOrderPricing } from './order-pricing';
import { DEFAULT_STATE_SHIPPING } from '@bro-pics/shared';

const TN = { state: 'Tamil Nadu', pincode: '626125' };
const KL = { state: 'Kerala', pincode: '682001' };

const variant = (over: Record<string, unknown> = {}) => ({
  id: 'v1', productId: 'p1', sku: 'S', sizeLabel: '8x12', frameColour: 'Black', material: 'Wood',
  widthIn: 8, heightIn: 12, price: 100000, stockStatus: 'in_stock', isActive: true, ...over,
});
const cart = [{ variantId: 'v1', personalizationId: 'pz1', title: 'Frame', qty: 2 }];
const run = (over: Record<string, unknown> = {}) =>
  computeOrderPricing(db, { userId: 'u1', cartItems: cart, couponCode: null, deliveryMethod: 'standard', address: TN, ...over } as never);

describe('computeOrderPricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ordersQuery.where.mockReturnValue(ordersQuery);
    mockFindVariantById.mockResolvedValue(variant());
    mockShipping.mockResolvedValue({ ...DEFAULT_STATE_SHIPPING, stateCharges: { Kerala: 8000 } });
    mockGst.mockResolvedValue({ gstEnabled: false, taxRate: 0 });
    mockPaidUses.mockReturnValue({ size: 0 });
  });

  it('derives price from the catalogue, never from the cart, and always satisfies total = subtotal - discount + shipping', async () => {
    const result = await run();
    expect(result.subtotal).toBe(200000);
    expect(result.total).toBe(result.subtotal - result.discount + result.shipping);
    expect(result.shipping).toBe(0); // Tamil Nadu is free
  });

  it('prices shipping from the address the server holds: Tamil Nadu free, other states by their own charge, any order size', async () => {
    mockFindVariantById.mockResolvedValue(variant({ price: 50000 }));
    const one = [{ ...cart[0], qty: 1 }];
    const tn = await run({ cartItems: one });
    expect(tn.shipping).toBe(0);
    expect(tn.shippingBasis).toBe('home_state_free');
    expect((await run({ cartItems: one, address: KL })).shipping).toBe(8000);
    mockFindVariantById.mockResolvedValue(variant({ price: 5000000 }));
    expect((await run({ cartItems: one, address: KL })).shipping).toBe(8000); // a big order is not free outside Tamil Nadu
  });

  it('never prices shipping as free when it cannot be determined', async () => {
    for (const address of [null, { state: 'Tamil Nadu', pincode: '682001' }, { state: 'Maharashtra', pincode: '400001' }, { state: 'Kerala', pincode: 'abc' }]) {
      const r = await run({ address });
      expect(r.shippingFailure).toBeTruthy();
      expect(r.total).toBeGreaterThanOrEqual(r.subtotal - r.discount);
    }
  });

  it('uses the shop PIN directory when it has the PIN: a PIN recorded as Puducherry cannot be claimed as Tamil Nadu', async () => {
    mockProduct.mockImplementation((name: string) =>
      name === 'shippingServiceability' ? { exists: true, data: () => ({ state: 'Puducherry' }) } : { exists: false }
    );
    const r = await run({ address: { state: 'Tamil Nadu', pincode: '605001' } });
    expect(r.shippingFailure).toBe('state_pincode_mismatch');
    mockProduct.mockReset();
  });

  it('flags a shared-prefix Tamil Nadu PIN that the directory has not confirmed', async () => {
    const r = await run({ address: { state: 'Tamil Nadu', pincode: '605001' } });
    expect(r.shipping).toBe(0);
    expect(r.shippingPin).toEqual({ verified: false, ambiguous: true });
  });

  it('express is refused unless the owner enabled it', async () => {
    expect((await run({ deliveryMethod: 'express' })).shippingFailure).toBeTruthy();
    mockShipping.mockResolvedValue({ ...DEFAULT_STATE_SHIPPING, expressEnabled: true, expressCharge: 15000 });
    expect((await run({ deliveryMethod: 'express' })).shipping).toBe(15000);
  });

  it('applies a percent coupon and reports it applied', async () => {
    mockFindCouponByCode.mockResolvedValue({ code: 'TEN', type: 'percent', value: 10, appliesTo: 'all', usedCount: 0, startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01') });
    const result = await run({ couponCode: 'TEN' });
    expect(result.discount).toBe(20000);
    expect(result.coupon).toEqual({ requested: true, applied: true, code: 'TEN', freeShipping: false });
    expect(result.total).toBe(180000);
  });

  it('zeroes shipping (not the discount) for a free_ship coupon', async () => {
    mockFindVariantById.mockResolvedValue(variant({ price: 50000 }));
    mockFindCouponByCode.mockResolvedValue({ code: 'SHIP', type: 'free_ship', value: 0, appliesTo: 'all', usedCount: 0, startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01') });
    const result = await run({ cartItems: [{ ...cart[0], qty: 1 }], couponCode: 'SHIP' });
    expect(result.shipping).toBe(0);
    expect(result.discount).toBe(0);
    expect(result.coupon).toMatchObject({ applied: true, freeShipping: true });
  });

  it('counts only PAID prior uses toward the per-user limit', async () => {
    mockFindCouponByCode.mockResolvedValue({ code: 'ONCE', type: 'percent', value: 10, appliesTo: 'all', usedCount: 0, perUserLimit: 1, startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01') });
    mockPaidUses.mockReturnValue({ size: 0 });
    expect((await run({ couponCode: 'ONCE' })).coupon).toMatchObject({ applied: true });
    expect(ordersQuery.where).toHaveBeenCalledWith('paymentStatus', '==', 'paid');

    mockPaidUses.mockReturnValue({ size: 1 });
    expect((await run({ couponCode: 'ONCE' })).coupon).toEqual({ requested: true, applied: false, reason: 'per_user_limit_reached' });
  });

  it('reports an unknown coupon without touching the totals', async () => {
    mockFindCouponByCode.mockResolvedValue(null);
    const result = await run({ couponCode: 'NOPE' });
    expect(result.coupon).toEqual({ requested: true, applied: false, reason: 'unknown_coupon' });
    expect(result.discount).toBe(0);
  });

  it('returns the unavailable lines and zero totals when an item cannot be bought', async () => {
    mockFindVariantById.mockResolvedValue(variant({ stockStatus: 'out_of_stock' }));
    const result = await run();
    expect(result.unavailable).toEqual([{ variantId: 'v1', reason: 'out_of_stock' }]);
    expect(result.total).toBe(0);
  });

  it('adds a GST line as a SPLIT of the inclusive total, never on top of it', async () => {
    mockGst.mockResolvedValue({ gstEnabled: true, taxRate: 18, gstin: '33ABCDE1234F1Z5' });
    const result = await run();
    expect(result.total).toBe(200000); // unchanged by GST
    expect(result.taxLines).toEqual([{ gstin: '33ABCDE1234F1Z5', rate: 18, amount: 30508 }]);
  });

  describe('glitter finish', () => {
    const glitterCart = [{ variantId: 'v1', personalizationId: 'pz1', title: 'Frame', qty: 1, finish: 'glitter' }];
    it('charges the product\'s own glitter extra on top of the size price, read from the product — not from the cart', async () => {
      mockProduct.mockReturnValue({ exists: true, data: () => ({ isActive: true, glitter: { enabled: true, extraPrice: 10000 } }) });
      const result = await run({ cartItems: [{ ...glitterCart[0], finishExtra: 5 }] });
      expect(result.unavailable).toEqual([]);
      expect(result.priced[0]).toMatchObject({ unitPrice: 110000, finish: 'glitter', finishExtra: 10000 });
      expect(result.subtotal).toBe(110000);
      expect(result.total).toBe(result.subtotal - result.discount + result.shipping);
    });
    it('makes the line unavailable when the product has glitter off, was unpublished, or is gone', async () => {
      for (const doc of [
        { exists: true, data: () => ({ isActive: true, glitter: { enabled: false, extraPrice: 10000 } }) },
        { exists: true, data: () => ({ isActive: true }) },
        { exists: true, data: () => ({ isActive: false, glitter: { enabled: true, extraPrice: 10000 } }) },
        { exists: false },
      ]) {
        mockProduct.mockReturnValue(doc);
        const result = await run({ cartItems: glitterCart });
        expect(result.unavailable).toEqual([{ variantId: 'v1', reason: 'finish_unavailable' }]);
        expect(result.total).toBe(0);
      }
    });
  });
});

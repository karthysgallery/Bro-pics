import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

const mockGetUserId = vi.fn();
vi.mock('../../../../lib/verify-id-token', () => ({ getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args) }));

const mockCreateRazorpayOrder = vi.fn();
vi.mock('../../../../lib/razorpay-client', () => ({
  createRazorpayOrder: (...args: unknown[]) => mockCreateRazorpayOrder(...args),
}));

const mockGetShippingSettings = vi.fn();
vi.mock('../../../../lib/firestore-settings', () => ({
  getShippingSettings: () => mockGetShippingSettings(),
}));

const mockFindVariantById = vi.fn();
vi.mock('../../../../lib/variant-lookup', () => ({ findVariantById: (...args: unknown[]) => mockFindVariantById(...args) }));

const mockFindCouponByCode = vi.fn();
vi.mock('../../../../lib/coupon-lookup', () => ({
  findCouponByCode: (...args: unknown[]) => mockFindCouponByCode(...args),
}));

// Mock the Admin SDK Firestore surface this route needs: reading carts/{uid}
// and users/{uid}/addresses/{addressId}, running one transaction (order
// number counter), and one batch commit (order + order items).
const mockCartDoc = { get: vi.fn() };
const mockAddressDoc = { get: vi.fn() };
const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockRunTransaction = vi.fn();
const mockDb = {
  collection: vi.fn((name: string) => ({
    doc: vi.fn((id?: string) => {
      if (name === 'carts') return mockCartDoc;
      if (name === 'users') {
        return {
          id: id ?? 'user_id',
          collection: vi.fn((subName: string) => {
            if (subName === 'addresses') return { doc: vi.fn(() => mockAddressDoc) };
            return { doc: vi.fn(() => ({ id: 'sub_id' })) };
          }),
        };
      }
      if (name === 'orders') {
        return {
          id: id ?? 'order_id',
          collection: vi.fn(() => ({ doc: vi.fn(() => ({ id: 'item_id' })) })),
        };
      }
      if (name === 'coupons') {
        return { id: id ?? 'coupon_id' };
      }
      return { id: id ?? 'generated_id', get: vi.fn(), collection: vi.fn(() => ({ doc: vi.fn(() => ({ id: 'item_id' })) })) };
    }),
    where: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ size: 0 }) })) })),
  })),
  doc: vi.fn(() => ({})),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
  batch: () => ({ set: mockBatchSet, update: mockBatchUpdate, commit: mockBatchCommit }),
};
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockDb,
  FieldValue: { increment: (n: number) => ({ __increment: n }) },
}));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

import { POST } from './route';
import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/checkout/create-order', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/checkout/create-order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitState();
  });

  it('returns 401 when there is no valid Authorization header', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(401);
  });

  it('returns 400 when the cart is empty', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({ exists: true, data: () => ({ items: [] }) });
    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(400);
  });

  it('returns 400 when the address does not exist', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 1 }] }),
    });
    mockAddressDoc.get.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ addressId: 'addr_missing' }));
    expect(response.status).toBe(400);
  });

  it('returns 409 with the unavailable lines when a variant is out of stock', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 1 }] }),
    });
    mockAddressDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: 'addr_1', line1: '12 MG Road', city: 'Chennai', state: 'TN', pincode: '600001', phone: '+91123', label: null, line2: null, isDefault: true }),
    });
    mockFindVariantById.mockResolvedValueOnce({
      id: 'v1',
      productId: 'p1',
      price: 1000,
      stockStatus: 'out_of_stock',
      isActive: true,
    });
    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.unavailable).toEqual([{ variantId: 'v1', reason: 'out_of_stock' }]);
  });

  it('returns 400 for a malformed cart line (qty <= 0) without ever calling Razorpay or the order-number transaction', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 0 }] }),
    });
    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
    expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed cart line (blank title) without ever calling Razorpay or the order-number transaction', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: '', qty: 1 }] }),
    });
    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
    expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed cart line (non-integer qty) without ever calling Razorpay or the order-number transaction', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 1.5 }] }),
    });
    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
    expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed cart line (non-string previewUrl) without ever calling Razorpay or the order-number transaction', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 1, previewUrl: 123 }] }),
    });
    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
    expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed cart line (null previewUrl) without ever calling Razorpay or the order-number transaction', async () => {
    // The app itself never writes previewUrl as null onto a cart line
    // (CartLineInput has it as `previewUrl?: string`, never nullable) — a
    // null here can only come from a hand-crafted write to the
    // owner-writable carts/{uid} doc, and is rejected the same as any other
    // non-string value, pinning that intentional decision against drift.
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 1, previewUrl: null }] }),
    });
    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
    expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed address (missing required fields) without ever calling Razorpay or the order-number transaction', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 1 }] }),
    });
    mockAddressDoc.get.mockResolvedValueOnce({
      // missing state, pincode, phone, etc. — the exact live bug the fix closes
      exists: true,
      data: () => ({ line1: '12 MG Road', city: 'Chennai' }),
    });
    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
    expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
  });

  it('creates a Razorpay order and an orders/{id} doc on a fully available cart', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 2, previewUrl: 'x.png' }] }),
    });
    mockAddressDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: 'addr_1', line1: '12 MG Road', city: 'Chennai', state: 'TN', pincode: '600001', phone: '+91123', label: null, line2: null, isDefault: true }),
    });
    mockFindVariantById.mockResolvedValueOnce({ id: 'v1', productId: 'p1', price: 1000, stockStatus: 'in_stock', isActive: true });
    mockGetShippingSettings.mockResolvedValueOnce({ freeShippingThreshold: 150000, flatShippingCharge: 5000 });
    mockRunTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<string>) =>
      fn({ get: vi.fn().mockResolvedValue({ exists: false }), set: vi.fn() })
    );
    mockCreateRazorpayOrder.mockResolvedValueOnce({ id: 'order_rzp_1' });

    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.razorpayOrderId).toBe('order_rzp_1');
    expect(body.amount).toBe(2 * 1000 + 5000); // subtotal + flat shipping (below free threshold)
    expect(mockCreateRazorpayOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 2 * 1000 + 5000, currency: 'INR' })
    );
    expect(mockBatchCommit).toHaveBeenCalled();

    const [, writtenOrder] = mockBatchSet.mock.calls[0];
    expect(writtenOrder).toMatchObject({
      userId: 'user_1',
      status: 'pending_payment',
      paymentStatus: 'pending',
      subtotal: 2000,
      shipping: 5000,
      total: 7000,
      razorpayOrderId: 'order_rzp_1',
      orderNo: `BP-${new Date().getFullYear()}-00001`,
    });

    const eventCall = mockBatchSet.mock.calls.find(([, data]) => data.createdBy === 'user_1');
    expect(eventCall).toBeDefined();
    const [, writtenEvent] = eventCall!;
    expect(writtenEvent).toMatchObject({
      status: 'pending_payment',
      note: null,
      courier: null,
      awbNumber: null,
      createdBy: 'user_1',
    });
  });

  function setUpValidCartAndAddress() {
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 2, previewUrl: 'x.png' }] }),
    });
    mockAddressDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: 'addr_1', line1: '12 MG Road', city: 'Chennai', state: 'TN', pincode: '600001', phone: '+91123', label: null, line2: null, isDefault: true }),
    });
    mockFindVariantById.mockResolvedValueOnce({ id: 'v1', productId: 'p1', price: 1000, stockStatus: 'in_stock', isActive: true });
    mockGetShippingSettings.mockResolvedValueOnce({ freeShippingThreshold: 150000, flatShippingCharge: 5000 });
    mockRunTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<string>) =>
      fn({ get: vi.fn().mockResolvedValue({ exists: false }), set: vi.fn() })
    );
    mockCreateRazorpayOrder.mockResolvedValueOnce({ id: 'order_rzp_1' });
  }

  describe('delivery method', () => {
    it('defaults to standard shipping when deliveryMethod is omitted', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();

      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(200);
      const [, writtenOrder] = mockBatchSet.mock.calls[0];
      expect(writtenOrder).toMatchObject({ shipping: 5000, deliveryMethod: 'standard' });
    });

    it('charges the express flat rate and records deliveryMethod on the order', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      mockCartDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 2, previewUrl: 'x.png' }] }),
      });
      mockAddressDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ id: 'addr_1', line1: '12 MG Road', city: 'Chennai', state: 'TN', pincode: '600001', phone: '+91123', label: null, line2: null, isDefault: true }),
      });
      mockFindVariantById.mockResolvedValueOnce({ id: 'v1', productId: 'p1', price: 1000, stockStatus: 'in_stock', isActive: true });
      // A subtotal well above the free-shipping threshold — express must
      // still charge its flat rate, proving it ignores that threshold.
      mockGetShippingSettings.mockResolvedValueOnce({ freeShippingThreshold: 1500, flatShippingCharge: 5000, expressShippingCharge: 15000 });
      mockRunTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<string>) =>
        fn({ get: vi.fn().mockResolvedValue({ exists: false }), set: vi.fn() })
      );
      mockCreateRazorpayOrder.mockResolvedValueOnce({ id: 'order_rzp_1' });

      const response = await POST(makeRequest({ addressId: 'addr_1', deliveryMethod: 'express' }));
      expect(response.status).toBe(200);
      const [, writtenOrder] = mockBatchSet.mock.calls[0];
      expect(writtenOrder).toMatchObject({ shipping: 15000, deliveryMethod: 'express' });
    });

    it('returns 400 for an unsupported deliveryMethod (e.g. same_day)', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      const response = await POST(makeRequest({ addressId: 'addr_1', deliveryMethod: 'same_day' }));
      expect(response.status).toBe(400);
      expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
    });
  });

  describe('coupon application', () => {
    it('applies a valid coupon: reduces total and writes couponId onto the order', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockFindCouponByCode.mockResolvedValueOnce({
        code: 'NEW10', type: 'percent', value: 10, appliesTo: 'all', usedCount: 0,
        startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01'),
      });
      const response = await POST(makeRequest({ addressId: 'addr_1', couponCode: 'NEW10' }));
      expect(response.status).toBe(200);
      expect(mockBatchSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ couponId: 'NEW10', discount: expect.any(Number) })
      );
      const [, writtenOrder] = mockBatchSet.mock.calls[0];
      // subtotal 2000, 10% off => discount 200
      expect(writtenOrder.discount).toBe(200);
      expect(writtenOrder.total).toBe(2000 - 200 + 5000);
      expect(writtenOrder.amountPaidOnline).toBe(6800);
      // Pin the Razorpay-charged amount to the discounted total — the
      // actual money failure mode is the order doc saying one number while
      // the gateway charges another.
      expect(mockCreateRazorpayOrder).toHaveBeenCalledWith(expect.objectContaining({ amount: 6800 }));
    });

    it('zeroes shipping (not discount) for a valid free_ship coupon', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockFindCouponByCode.mockResolvedValueOnce({
        code: 'FREESHIP', type: 'free_ship', value: 0, appliesTo: 'all', usedCount: 0,
        startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01'),
      });
      const response = await POST(makeRequest({ addressId: 'addr_1', couponCode: 'FREESHIP' }));
      expect(response.status).toBe(200);
      expect(mockBatchSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ shipping: 0, discount: 0, couponId: 'FREESHIP' })
      );
    });

    it('writes couponId from the looked-up coupon, not the raw client string', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockFindCouponByCode.mockResolvedValueOnce({
        code: 'NEW10', type: 'percent', value: 10, appliesTo: 'all', usedCount: 0,
        startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01'),
      });
      await POST(makeRequest({ addressId: 'addr_1', couponCode: '  new10  ' }));
      expect(mockBatchSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ couponId: 'NEW10' })
      );
    });

    it('proceeds without a discount when the coupon fails re-validation, rather than blocking the order', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockFindCouponByCode.mockResolvedValueOnce(null); // unknown/expired by order time
      const response = await POST(makeRequest({ addressId: 'addr_1', couponCode: 'STALE' }));
      expect(response.status).toBe(200);
      expect(mockBatchSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ discount: 0 })
      );
      // A stale/invalid coupon must never still get "used" — guards against
      // the usedCount increment firing when no coupon actually applied.
      expect(mockBatchUpdate).not.toHaveBeenCalled();
    });

    it('increments the coupon usedCount in the same batch as a successful coupon order', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockFindCouponByCode.mockResolvedValueOnce({
        code: 'NEW10', type: 'percent', value: 10, appliesTo: 'all', usedCount: 0,
        startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01'),
      });
      await POST(makeRequest({ addressId: 'addr_1', couponCode: 'NEW10' }));
      expect(mockBatchUpdate).toHaveBeenCalledWith(expect.anything(), { usedCount: expect.anything() });
    });

    it('still produces discount: 0, no couponId when no couponCode is sent (backward compatible)', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(200);
      expect(mockBatchSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ discount: 0 })
      );
      const orderArg = mockBatchSet.mock.calls.find((call) => call[1]?.orderNo)?.[1];
      // Must be absent from the object entirely, not present with value
      // `undefined` — Firestore's Admin SDK rejects `undefined` field
      // values, so `'couponId' in orderArg` must be false, not merely
      // `orderArg.couponId === undefined` (which a bare
      // `couponId: appliedCouponId` key would also satisfy).
      expect(orderArg && 'couponId' in orderArg).toBe(false);
    });
  });

  it('returns 429 and does not touch Firestore or Razorpay when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mockGetUserId).not.toHaveBeenCalled();
    expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
  });
});

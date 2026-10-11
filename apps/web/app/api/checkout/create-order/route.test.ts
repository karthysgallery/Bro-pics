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
const mockGetGstSettings = vi.fn().mockResolvedValue({ gstEnabled: false, taxRate: 0 });
vi.mock('../../../../lib/firestore-settings', () => ({
  getShippingSettings: () => mockGetShippingSettings(),
  getGstSettings: () => mockGetGstSettings(),
}));

const mockFindVariantById = vi.fn();
vi.mock('../../../../lib/variant-lookup', () => ({ findVariantById: (...args: unknown[]) => mockFindVariantById(...args) }));

const mockBuildLineSnapshot = vi.hoisted(() => vi.fn());
vi.mock('../../../../lib/personalization-order', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/personalization-order')>('../../../../lib/personalization-order');
  return { ...actual, buildLineSnapshot: (...a: unknown[]) => mockBuildLineSnapshot(...a) };
});

// Combo Offers: the catalogue lookups behind priceComboLines are faked per test.
const mockComboDeps = vi.hoisted(() => ({ loadCombo: vi.fn(), loadVariant: vi.fn(), isProductAvailable: vi.fn() }));
vi.mock('../../../../lib/firestore-combos', () => ({ firestoreComboDeps: () => mockComboDeps }));

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
const mockBatchCreate = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockRunTransaction = vi.fn();
const mockCustomizationsWhereGet = vi.fn().mockResolvedValue({ docs: [] });
const mockIdempotencyWhereGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });
const mockPerUserLimitWhereGet = vi.fn().mockResolvedValue({ size: 0 });
const mockProductDocGet = vi.fn().mockResolvedValue({ exists: false });
const mockVariantDocGet = vi.fn().mockResolvedValue({ exists: false });
const mockOrderDocGet = vi.fn().mockResolvedValue({ exists: false });
const mockUserDocGet = vi.fn().mockResolvedValue({ exists: false });
const mockDb = {
  collection: vi.fn((name: string) => ({
    doc: vi.fn((id?: string) => {
      if (name === 'carts') return mockCartDoc;
      if (name === 'products') {
        return {
          id: id ?? 'product_id',
          get: () => mockProductDocGet(id),
          collection: vi.fn(() => ({ doc: vi.fn((variantId: string) => ({ get: () => mockVariantDocGet(id, variantId) })) })),
        };
      }
      if (name === 'users') {
        return {
          id: id ?? 'user_id',
          get: () => mockUserDocGet(id),
          collection: vi.fn((subName: string) => {
            if (subName === 'addresses') return { doc: vi.fn(() => mockAddressDoc) };
            return { doc: vi.fn(() => ({ id: 'sub_id' })) };
          }),
        };
      }
      if (name === 'orders') {
        return {
          id: id ?? 'order_id',
          get: () => mockOrderDocGet(id),
          collection: vi.fn(() => ({ doc: vi.fn(() => ({ id: 'item_id' })) })),
        };
      }
      if (name === 'coupons') {
        return { id: id ?? 'coupon_id' };
      }
      return { id: id ?? 'generated_id', get: vi.fn(), collection: vi.fn(() => ({ doc: vi.fn(() => ({ id: 'item_id' })) })) };
    }),
    where: vi.fn((field: string) => {
      if (field === 'personalizationId') {
        // The BE-10/BE-12 draft->ordered query: customizations.where('personalizationId', '==', pid).get()
        return { get: (...args: unknown[]) => mockCustomizationsWhereGet(...args) };
      }
      return {
        where: vi.fn((field2: string) => {
          if (field2 === 'idempotencyKey') {
            // BE-13: orders.where('userId',...).where('idempotencyKey',...).limit(1).get()
            return { limit: vi.fn(() => ({ get: (...args: unknown[]) => mockIdempotencyWhereGet(...args) })) };
          }
          // BE-14: orders.where('userId',...).where('couponId',...).where('paymentStatus','==','paid').get()
          return {
            where: vi.fn(() => ({ get: (...args: unknown[]) => mockPerUserLimitWhereGet(...args) })),
            get: (...args: unknown[]) => mockPerUserLimitWhereGet(...args),
          };
        }),
      };
    }),
  })),
  doc: vi.fn(() => ({})),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
  batch: () => ({ set: mockBatchSet, create: mockBatchCreate, update: mockBatchUpdate, commit: mockBatchCommit }),
};
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockDb,
  FieldValue: { increment: (n: number) => ({ __increment: n }) },
}));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

import { POST } from './route';
import { buildOrderSnapshot, createEmptyState } from '@bro-pics/shared';
import { singlePhotoTemplate } from '@bro-pics/shared/src/personalization/test-fixtures';
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
    mockCreateRazorpayOrder.mockReset(); // clearAllMocks leaves queued mockResolvedValueOnce values behind
    mockProductDocGet.mockReset();
    mockProductDocGet.mockResolvedValue({ exists: false });
    mockUserDocGet.mockReset();
    mockUserDocGet.mockResolvedValue({ exists: false });
    resetRateLimitState();
    // These tests exercise the Razorpay-provider path; the mock provider has
    // its own describe block below.
    process.env.PAYMENT_PROVIDER = 'razorpay';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
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

  it('returns 400 for a malformed cart line (qty above the 20-unit bound) [BE-09] without ever calling Razorpay or the order-number transaction', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 21 }] }),
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

  it('returns 400 for a malformed cart line (non-string previewPath) without ever calling Razorpay or the order-number transaction', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 1, previewPath: 123 }] }),
    });
    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
    expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed cart line (null previewPath) without ever calling Razorpay or the order-number transaction', async () => {
    // The app itself never writes previewPath as null onto a cart line
    // (CartLineInput has it as `previewPath?: string`, never nullable) — a
    // null here can only come from a hand-crafted write to the
    // owner-writable carts/{uid} doc, and is rejected the same as any other
    // non-string value, pinning that intentional decision against drift.
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 1, previewPath: null }] }),
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
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 2, previewPath: 'x.png' }] }),
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

    const [, writtenOrder] = mockBatchCreate.mock.calls[0];
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

  describe('glitter finish', () => {
    const cartWith = (item: Record<string, unknown>) =>
      mockCartDoc.get.mockResolvedValueOnce({ exists: true, data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 2, previewPath: 'x.png', ...item }] }) });
    const glitterProduct = { exists: true, data: () => ({ title: 'Lord Murugan', isActive: true, glitter: { enabled: true, extraPrice: 10000 }, personalizationTemplateId: null, photoSlots: 1 }) };

    it('returns 400 for a finish this shop does not have, without opening a payment', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      cartWith({ finish: 'sparkle' });
      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(400);
      expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
    });

    it('returns 409 finish_unavailable when the product does not offer glitter', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      cartWith({ finish: 'glitter' });
      mockAddressDoc.get.mockResolvedValueOnce({ exists: true, data: () => ({ id: 'addr_1', line1: '12 MG Road', city: 'Chennai', state: 'TN', pincode: '600001', phone: '+91123', label: null, line2: null, isDefault: true }) });
      mockFindVariantById.mockResolvedValueOnce({ id: 'v1', productId: 'p1', price: 1000, stockStatus: 'in_stock', isActive: true });
      // (no shipping value is queued: pricing stops at the unavailable line before it is read)
      mockProductDocGet.mockResolvedValue({ exists: true, data: () => ({ title: 'Lord Murugan', isActive: true }) });
      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      mockProductDocGet.mockResolvedValue({ exists: false });
      expect(response.status).toBe(409);
      expect((await response.json()).unavailable).toEqual([{ variantId: 'v1', reason: 'finish_unavailable' }]);
      expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
    });

    it('charges the product\'s glitter extra per frame and freezes the finish on the order and its item', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      cartWith({ finish: 'glitter', finishExtra: 1 }); // the cart\'s own number is ignored
      mockAddressDoc.get.mockResolvedValueOnce({ exists: true, data: () => ({ id: 'addr_1', line1: '12 MG Road', city: 'Chennai', state: 'TN', pincode: '600001', phone: '+91123', label: null, line2: null, isDefault: true }) });
      mockFindVariantById.mockResolvedValueOnce({ id: 'v1', productId: 'p1', price: 1000, stockStatus: 'in_stock', isActive: true });
      mockGetShippingSettings.mockResolvedValueOnce({ freeShippingThreshold: 150000, flatShippingCharge: 5000 });
      mockProductDocGet.mockResolvedValue(glitterProduct);
      mockRunTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<string>) => fn({ get: vi.fn().mockResolvedValue({ exists: false }), set: vi.fn() }));
      mockCreateRazorpayOrder.mockResolvedValueOnce({ id: 'order_rzp_1' });

      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      mockProductDocGet.mockResolvedValue({ exists: false });
      expect(response.status).toBe(200);
      expect((await response.json()).amount).toBe(2 * (1000 + 10000) + 5000);
      const [, order] = mockBatchCreate.mock.calls[0];
      expect(order).toMatchObject({ subtotal: 22000, total: 27000, hasGlitter: true });
      const item = mockBatchSet.mock.calls.map(([, data]) => data).find((d) => d.variantId === 'v1');
      expect(item).toMatchObject({ unitPrice: 11000, finish: 'glitter', finishExtra: 10000, qty: 2 });
    });
  });

  function setUpValidCartAndAddress() {
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 2, previewPath: 'x.png' }] }),
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

  describe('GST [BE-22]', () => {
    it('leaves taxLines empty when GST is disabled (the default)', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();

      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(200);
      const orderArg = mockBatchCreate.mock.calls[0]?.[1];
      expect(orderArg?.taxLines).toEqual([]);
    });

    it('populates taxLines with a GST split of the total when GST is enabled, never adding to the total', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockGetGstSettings.mockResolvedValueOnce({ gstEnabled: true, taxRate: 18, gstin: '33AAAAA0000A1Z5' });

      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(200);
      const orderArg = mockBatchCreate.mock.calls[0]?.[1];
      expect(orderArg?.taxLines).toHaveLength(1);
      const [taxLine] = orderArg!.taxLines as Array<{ gstin: string; rate: number; amount: number }>;
      expect(taxLine.gstin).toBe('33AAAAA0000A1Z5');
      expect(taxLine.rate).toBe(18);
      expect(taxLine.amount).toBeGreaterThan(0);
      // Never an addition on top of what the customer pays.
      expect(orderArg?.total).toBe(2000 + 5000);
    });
  });

  describe('productIds denormalization [BE-25a]', () => {
    it('writes the distinct set of productIds from the priced cart lines onto the order', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress(); // single line, variant v1 -> productId 'p1'

      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(200);
      const orderArg = mockBatchCreate.mock.calls[0]?.[1];
      expect(orderArg?.productIds).toEqual(['p1']);
    });
  });

  describe('delivery method', () => {
    it('defaults to standard shipping when deliveryMethod is omitted', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();

      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(200);
      const [, writtenOrder] = mockBatchCreate.mock.calls[0];
      expect(writtenOrder).toMatchObject({ shipping: 5000, deliveryMethod: 'standard' });
    });

    it('charges the express flat rate and records deliveryMethod on the order', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      mockCartDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 2, previewPath: 'x.png' }] }),
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
      const [, writtenOrder] = mockBatchCreate.mock.calls[0];
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
      expect(mockBatchCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ couponId: 'NEW10', discount: expect.any(Number) })
      );
      const [, writtenOrder] = mockBatchCreate.mock.calls[0];
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
      expect(mockBatchCreate).toHaveBeenCalledWith(
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
      expect(mockBatchCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ couponId: 'NEW10' })
      );
    });

    it('REFUSES the order (409 coupon_invalid) when a coupon the customer asked for no longer applies, instead of silently charging full price', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockFindCouponByCode.mockResolvedValueOnce(null); // expired/removed between "Apply" and "Place order"
      const response = await POST(makeRequest({ addressId: 'addr_1', couponCode: 'STALE' }));
      const body = await response.json();
      expect(response.status).toBe(409);
      expect(body.code).toBe('coupon_invalid');
      expect(body.reason).toBe('unknown_coupon');
      // Nothing was created, no order number burned, no payment session opened.
      expect(mockBatchCommit).not.toHaveBeenCalled();
      expect(mockRunTransaction).not.toHaveBeenCalled();
      expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
    });

    it('also refuses (409) when the coupon is valid in general but this customer has used it up', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockFindCouponByCode.mockResolvedValueOnce({
        code: 'ONCE', type: 'percent', value: 10, appliesTo: 'all', usedCount: 0, perUserLimit: 1,
        startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01'),
      });
      mockPerUserLimitWhereGet.mockResolvedValueOnce({ size: 1 });
      const response = await POST(makeRequest({ addressId: 'addr_1', couponCode: 'ONCE' }));
      expect(response.status).toBe(409);
      expect((await response.json()).reason).toBe('per_user_limit_reached');
    });

    it('does NOT increment usedCount at order creation [BE-14] — only razorpayWebhook does, once payment is confirmed', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockFindCouponByCode.mockResolvedValueOnce({
        code: 'NEW10', type: 'percent', value: 10, appliesTo: 'all', usedCount: 0,
        startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01'),
      });
      await POST(makeRequest({ addressId: 'addr_1', couponCode: 'NEW10' }));
      expect(mockBatchUpdate).not.toHaveBeenCalledWith(expect.anything(), { usedCount: expect.anything() });
    });

    it('applies the coupon when the customer has abandoned (unpaid) prior attempts but zero PAID uses [BE-14]', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockFindCouponByCode.mockResolvedValueOnce({
        code: 'ONECOUP', type: 'percent', value: 10, appliesTo: 'all', usedCount: 3, perUserLimit: 1,
        startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01'),
      });
      // The mock's paymentStatus-filtered query returns 0 — proving the
      // check is scoped to paid orders, not every order this coupon code
      // has ever appeared on for this user.
      mockPerUserLimitWhereGet.mockResolvedValueOnce({ size: 0 });

      const response = await POST(makeRequest({ addressId: 'addr_1', couponCode: 'ONECOUP' }));
      const orderArg = mockBatchCreate.mock.calls[0]?.[1];

      expect(response.status).toBe(200);
      expect(orderArg?.discount).toBeGreaterThan(0);
      expect(orderArg?.couponId).toBe('ONECOUP');
    });

    describe('appliesTo enforcement [BE-24]', () => {
      it('applies the full discount when the cart\'s product is in a product-scoped coupon\'s productIds', async () => {
        mockGetUserId.mockResolvedValueOnce('user_1');
        setUpValidCartAndAddress(); // cart line's productId is 'p1', subtotal 2000
        mockFindCouponByCode.mockResolvedValueOnce({
          code: 'P1ONLY', type: 'percent', value: 10, appliesTo: 'product', productIds: ['p1'], usedCount: 0,
          startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01'),
        });
        const response = await POST(makeRequest({ addressId: 'addr_1', couponCode: 'P1ONLY' }));
        expect(response.status).toBe(200);
        const orderArg = mockBatchCreate.mock.calls[0]?.[1];
        expect(orderArg?.discount).toBe(200); // 10% of the full 2000 subtotal — the whole cart is eligible
      });

      it('applies zero discount when the cart has no line matching a product-scoped coupon\'s productIds', async () => {
        mockGetUserId.mockResolvedValueOnce('user_1');
        setUpValidCartAndAddress(); // cart line's productId is 'p1'
        mockFindCouponByCode.mockResolvedValueOnce({
          code: 'OTHERPRODUCT', type: 'percent', value: 10, appliesTo: 'product', productIds: ['p_unrelated'], usedCount: 0,
          startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01'),
        });
        const response = await POST(makeRequest({ addressId: 'addr_1', couponCode: 'OTHERPRODUCT' }));
        expect(response.status).toBe(200);
        const orderArg = mockBatchCreate.mock.calls[0]?.[1];
        expect(orderArg?.discount).toBe(0);
      });

      it('applies the discount when the cart\'s product resolves to a category in a category-scoped coupon\'s categoryIds', async () => {
        mockGetUserId.mockResolvedValueOnce('user_1');
        setUpValidCartAndAddress();
        mockProductDocGet.mockResolvedValue({ exists: true, id: 'p1', data: () => ({ categoryId: 'c1' }) }); // read for the title snapshot AND for category eligibility
        mockFindCouponByCode.mockResolvedValueOnce({
          code: 'CAT1', type: 'percent', value: 10, appliesTo: 'category', categoryIds: ['c1'], usedCount: 0,
          startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01'),
        });
        const response = await POST(makeRequest({ addressId: 'addr_1', couponCode: 'CAT1' }));
        expect(response.status).toBe(200);
        const orderArg = mockBatchCreate.mock.calls[0]?.[1];
        expect(orderArg?.discount).toBe(200);
      });

      it('applies zero discount when the cart\'s product resolves to a category NOT in a category-scoped coupon\'s categoryIds', async () => {
        mockGetUserId.mockResolvedValueOnce('user_1');
        setUpValidCartAndAddress();
        mockProductDocGet.mockResolvedValue({ exists: true, id: 'p1', data: () => ({ categoryId: 'c_unrelated' }) });
        mockFindCouponByCode.mockResolvedValueOnce({
          code: 'CAT1', type: 'percent', value: 10, appliesTo: 'category', categoryIds: ['c1'], usedCount: 0,
          startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01'),
        });
        const response = await POST(makeRequest({ addressId: 'addr_1', couponCode: 'CAT1' }));
        expect(response.status).toBe(200);
        const orderArg = mockBatchCreate.mock.calls[0]?.[1];
        expect(orderArg?.discount).toBe(0);
      });
    });

    it('still produces discount: 0, no couponId when no couponCode is sent (backward compatible)', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(200);
      expect(mockBatchCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ discount: 0 })
      );
      const orderArg = mockBatchCreate.mock.calls[0]?.[1];
      // Must be absent from the object entirely, not present with value
      // `undefined` — Firestore's Admin SDK rejects `undefined` field
      // values, so `'couponId' in orderArg` must be false, not merely
      // `orderArg.couponId === undefined` (which a bare
      // `couponId: appliedCouponId` key would also satisfy).
      expect(orderArg && 'couponId' in orderArg).toBe(false);
    });
  });

  it('transitions a referenced draft customization to ordered in the same batch [BE-10/BE-12]', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    setUpValidCartAndAddress();
    const custDocRef = { id: 'cust_1' };
    mockCustomizationsWhereGet.mockResolvedValueOnce({
      docs: [{ ref: custDocRef, data: () => ({ status: 'draft', userId: 'user_1' }) }],
    });

    await POST(makeRequest({ addressId: 'addr_1' }));

    expect(mockBatchUpdate).toHaveBeenCalledWith(custDocRef, { status: 'ordered' });
  });

  it('does not re-transition a customization that is not still a draft (e.g. already ordered by a prior attempt)', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    setUpValidCartAndAddress();
    const custDocRef = { id: 'cust_1' };
    mockCustomizationsWhereGet.mockResolvedValueOnce({
      docs: [{ ref: custDocRef, data: () => ({ status: 'ordered', userId: 'user_1' }) }],
    });

    await POST(makeRequest({ addressId: 'addr_1' }));

    expect(mockBatchUpdate).not.toHaveBeenCalledWith(custDocRef, { status: 'ordered' });
  });

  describe('personalizationId ownership [BE-35]', () => {
    it('returns 404 and commits nothing when a referenced customization belongs to a different user', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockCustomizationsWhereGet.mockResolvedValueOnce({
        docs: [{ ref: { id: 'cust_1' }, data: () => ({ status: 'draft', userId: 'someone_else' }) }],
      });

      const response = await POST(makeRequest({ addressId: 'addr_1' }));

      expect(response.status).toBe(404);
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it('returns 404 when a referenced customization has no userId at all (never reconciled to an account)', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockCustomizationsWhereGet.mockResolvedValueOnce({
        docs: [{ ref: { id: 'cust_1' }, data: () => ({ status: 'draft' }) }],
      });

      const response = await POST(makeRequest({ addressId: 'addr_1' }));

      expect(response.status).toBe(404);
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it('proceeds normally when every referenced customization belongs to the caller', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockCustomizationsWhereGet.mockResolvedValueOnce({
        docs: [{ ref: { id: 'cust_1' }, data: () => ({ status: 'draft', userId: 'user_1' }) }],
      });

      const response = await POST(makeRequest({ addressId: 'addr_1' }));

      expect(response.status).toBe(200);
      expect(mockBatchCommit).toHaveBeenCalled();
    });
  });

  describe('idempotency [BE-13]', () => {
    // The fingerprint is internal, so these tests learn it the honest way: place
    // an order once, read the inputsHash that was written onto it, then describe
    // that order to the "prior orders under this key" query.
    async function placeOnceAndReadHash(body: Record<string, unknown> = {}) {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockIdempotencyWhereGet.mockResolvedValueOnce({ empty: true, docs: [] });
      const response = await POST(makeRequest({ addressId: 'addr_1', idempotencyKey: 'attempt_1', ...body }));
      expect(response.status).toBe(200);
      const written = mockBatchCreate.mock.calls[0][1];
      return { hash: written.inputsHash as string, orderId: written.id as string };
    }

    it('creates a normal new order and persists the idempotencyKey and inputsHash when none exists yet', async () => {
      const { hash } = await placeOnceAndReadHash();
      const orderArg = mockBatchCreate.mock.calls[0]?.[1];
      expect(orderArg?.idempotencyKey).toBe('attempt_1');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(mockCreateRazorpayOrder).toHaveBeenCalledOnce();
    });

    it('returns the SAME pending order/payment session on a retry whose inputs have not changed', async () => {
      const { hash } = await placeOnceAndReadHash();
      vi.clearAllMocks();
      mockCreateRazorpayOrder.mockReset();

      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockIdempotencyWhereGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ id: 'order_existing', orderNo: 'BP-2026-00001', status: 'pending_payment', paymentStatus: 'pending', paymentProvider: 'razorpay', razorpayOrderId: 'rzp_existing', total: 7000, inputsHash: hash }) }],
      });
      const response = await POST(makeRequest({ addressId: 'addr_1', idempotencyKey: 'attempt_1' }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.orderId).toBe('order_existing');
      expect(body.razorpayOrderId).toBe('rzp_existing');
      expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
      expect(mockBatchCreate).not.toHaveBeenCalled();
      expect(mockRunTransaction).not.toHaveBeenCalled(); // no order number consumed
    });

    it('creates a NEW order and supersedes the stale pending one when the cart/address/coupon changed since the failed attempt', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      // A pending order under the same key, but for different inputs (different hash).
      mockIdempotencyWhereGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ id: 'order_stale', status: 'pending_payment', paymentStatus: 'failed', paymentProvider: 'razorpay', razorpayOrderId: 'rzp_stale', total: 3000, inputsHash: 'a-different-hash' }) }],
      });

      const response = await POST(makeRequest({ addressId: 'addr_1', idempotencyKey: 'attempt_1' }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.orderId).not.toBe('order_stale');
      expect(body.razorpayOrderId).not.toBe('rzp_stale');
      expect(mockCreateRazorpayOrder).toHaveBeenCalledOnce();
      // The stale order is cancelled in the same atomic batch, with an explanatory event.
      expect(mockBatchUpdate).toHaveBeenCalledWith(expect.anything(), { status: 'cancelled' });
      expect(mockBatchSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'cancelled', note: 'Superseded by a newer checkout', createdBy: 'system_checkout' })
      );
    });

    it('gives different orders (different ids) for the same key when the inputs differ, so concurrent edits can\'t collide', async () => {
      const first = await placeOnceAndReadHash();
      vi.clearAllMocks();
      mockCreateRazorpayOrder.mockReset();
      mockProductDocGet.mockResolvedValue({ exists: false });

      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockCartDoc.get.mockReset();
      mockCartDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 3, previewPath: 'x.png' }] }), // qty 2 -> 3
      });
      mockIdempotencyWhereGet.mockResolvedValueOnce({ empty: true, docs: [] });
      await POST(makeRequest({ addressId: 'addr_1', idempotencyKey: 'attempt_1' }));
      const second = mockBatchCreate.mock.calls[0][1];
      expect(second.inputsHash).not.toBe(first.hash);
      expect(second.id).not.toBe(first.orderId);
    });

    it('returns 409 already_paid when a retry arrives after the order settled (paymentStatus paid, even though status has moved on)', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockIdempotencyWhereGet.mockResolvedValueOnce({
        empty: false,
        // Settlement moves status past 'paid' within one transaction — paymentStatus is the truth.
        docs: [{ data: () => ({ id: 'order_paid', status: 'print_rendering', paymentStatus: 'paid', razorpayOrderId: 'rzp_paid', total: 5000, inputsHash: 'whatever' }) }],
      });

      const response = await POST(makeRequest({ addressId: 'addr_1', idempotencyKey: 'attempt_1' }));
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.code).toBe('already_paid');
      expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
      expect(mockBatchCreate).not.toHaveBeenCalled();
    });

    it('creates a normal new order when no idempotencyKey is sent (backward compatible)', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();

      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(200);
      expect(mockIdempotencyWhereGet).not.toHaveBeenCalled();
      const orderArg = mockBatchCreate.mock.calls[0]?.[1];
      expect(orderArg && 'idempotencyKey' in orderArg).toBe(false);
      expect(orderArg && 'inputsHash' in orderArg).toBe(false);
    });
  });

  describe('payment provider (server-side config, never client-controlled)', () => {
    function setUpCartForAnyProvider() {
      mockCartDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 2, previewPath: 'x.png' }] }),
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
    }

    it('mock provider: creates the order pending_payment (NOT paid), records paymentProvider, and never calls Razorpay', async () => {
      process.env.PAYMENT_PROVIDER = 'mock';
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpCartForAnyProvider();

      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({ paymentProvider: 'mock', status: 'pending_payment', paymentStatus: 'pending', keyId: null });
      expect(body.razorpayOrderId).toMatch(/^order_mock_/);
      expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();

      const [, writtenOrder] = mockBatchCreate.mock.calls[0];
      expect(writtenOrder).toMatchObject({ status: 'pending_payment', paymentStatus: 'pending', paymentProvider: 'mock' });
      // No inline "paid" event and no cart clearing: settlement is the shared pipeline's job.
      expect(mockBatchSet.mock.calls.some(([, data]) => data?.status === 'paid')).toBe(false);
    });

    it('ignores a client-supplied isMock flag: with the razorpay provider the order stays pending_payment and Razorpay is called', async () => {
      process.env.PAYMENT_PROVIDER = 'razorpay';
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpCartForAnyProvider();
      mockCreateRazorpayOrder.mockResolvedValueOnce({ id: 'order_rzp_real' });

      const response = await POST(makeRequest({ addressId: 'addr_1', isMock: true }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(mockCreateRazorpayOrder).toHaveBeenCalledOnce();
      expect(body).toMatchObject({ paymentProvider: 'razorpay', status: 'pending_payment', razorpayOrderId: 'order_rzp_real' });
    });

    it('fails closed with 503 in production when PAYMENT_PROVIDER is unset — no free orders from a forgotten env var — and consumes no order number', async () => {
      delete process.env.PAYMENT_PROVIDER;
      delete process.env.RAZORPAY_KEY_ID;
      const env = process.env as Record<string, string | undefined>;
      const originalNodeEnv = env.NODE_ENV;
      env.NODE_ENV = 'production';
      try {
        mockGetUserId.mockResolvedValueOnce('user_1');
        const response = await POST(makeRequest({ addressId: 'addr_1' }));
        expect(response.status).toBe(503);
        expect((await response.json()).code).toBe('payments_unavailable');
        expect(mockRunTransaction).not.toHaveBeenCalled();
        expect(mockBatchCommit).not.toHaveBeenCalled();
      } finally {
        env.NODE_ENV = originalNodeEnv;
      }
    });

    it('fails closed with 503 when razorpay is selected but its keys are missing (no silent fallback to mock)', async () => {
      process.env.PAYMENT_PROVIDER = 'razorpay';
      delete process.env.RAZORPAY_KEY_SECRET;
      mockGetUserId.mockResolvedValueOnce('user_1');
      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(503);
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });
  });

  describe('structured personalization (template v2)', () => {
    const claim = { templateId: 'single-8x12', templateVersion: 1, state: { templateId: 'single-8x12', templateVersion: 1, slots: {}, texts: {} } };
    const snapshot = buildOrderSnapshot(singlePhotoTemplate, createEmptyState('single-8x12', 1), new Date('2026-10-05T00:00:00Z'));
    function cartWithPersonalization() {
      mockCartDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 2, previewPath: 'x.png', personalization: claim }] }),
      });
      mockAddressDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ id: 'addr_1', line1: '12 MG Road', city: 'Chennai', state: 'TN', pincode: '600001', phone: '+91123', label: null, line2: null, isDefault: true }),
      });
      mockFindVariantById.mockResolvedValueOnce({ id: 'v1', productId: 'p1', price: 1000, stockStatus: 'in_stock', isActive: true });
      mockGetShippingSettings.mockResolvedValueOnce({ freeShippingThreshold: 150000, flatShippingCharge: 5000 });
      mockRunTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<string>) => fn({ get: vi.fn().mockResolvedValue({ exists: false }), set: vi.fn() }));
      mockCreateRazorpayOrder.mockResolvedValueOnce({ id: 'order_rzp_1' });
    }

    it('stores the VERIFIED snapshot (not the browser\'s claim) on the order item', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      cartWithPersonalization();
      mockBuildLineSnapshot.mockResolvedValueOnce(snapshot);
      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(200);
      expect(mockBuildLineSnapshot).toHaveBeenCalledWith(expect.anything(), 'user_1', claim, { offeredTemplateId: null });
      const item = mockBatchSet.mock.calls.map(([, d]) => d).find((d) => d?.variantId === 'v1');
      expect(item.personalization).toEqual(snapshot);
    });

    it('checks the design against the template the variant offers, at the variant\'s print size', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      cartWithPersonalization();
      mockProductDocGet.mockImplementation(async (id: string) =>
        id === 'p1' ? { exists: true, data: () => ({ title: 'Collage frame', personalizationTemplateId: 'product-design' }) } : { exists: false }
      );
      mockVariantDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ widthIn: 12, heightIn: 18, personalizationTemplateId: 'single-8x12' }) });
      mockBuildLineSnapshot.mockResolvedValueOnce(snapshot);
      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(200);
      expect(mockVariantDocGet).toHaveBeenCalledWith('p1', 'v1');
      expect(mockBuildLineSnapshot).toHaveBeenCalledWith(expect.anything(), 'user_1', claim, {
        offeredTemplateId: 'single-8x12',
        printSizeIn: { width: 12, height: 18 },
      });
      mockProductDocGet.mockReset().mockResolvedValue({ exists: false });
    });

    it('refuses the order (409 personalization_invalid) BEFORE any order number or payment session when validation fails', async () => {
      const { PersonalizationRejectedError } = await import('../../../../lib/personalization-order');
      mockGetUserId.mockResolvedValueOnce('user_1');
      cartWithPersonalization();
      mockBuildLineSnapshot.mockRejectedValueOnce(new PersonalizationRejectedError('asset_not_owned', 'One of your photos could not be found. Please upload it again.'));
      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      const body = await response.json();
      expect(response.status).toBe(409);
      expect(body).toMatchObject({ code: 'personalization_invalid', reason: 'asset_not_owned' });
      expect(mockRunTransaction).not.toHaveBeenCalled();
      expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it('changing the personalization changes the order fingerprint (a retry after editing the design is a NEW order)', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      cartWithPersonalization();
      mockBuildLineSnapshot.mockResolvedValueOnce(snapshot);
      await POST(makeRequest({ addressId: 'addr_1', idempotencyKey: 'k1' }));
      const first = mockBatchCreate.mock.calls[0][1].inputsHash;

      vi.clearAllMocks();
      mockCreateRazorpayOrder.mockReset();
      mockGetUserId.mockResolvedValueOnce('user_1');
      cartWithPersonalization();
      mockBuildLineSnapshot.mockResolvedValueOnce({ ...snapshot, state: { ...snapshot.state, texts: { name: { value: 'changed' } } } });
      await POST(makeRequest({ addressId: 'addr_1', idempotencyKey: 'k1' }));
      expect(mockBatchCreate.mock.calls[0][1].inputsHash).not.toBe(first);
    });

    it('rejects a malformed personalization claim on a cart line (400) without calling the validator', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      mockCartDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 1, personalization: 'not-an-object' }] }),
      });
      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(400);
      expect(mockBuildLineSnapshot).not.toHaveBeenCalled();
    });

    it('lines WITHOUT v2 personalization (legacy per-slot customizations) are untouched', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(200);
      expect(mockBuildLineSnapshot).not.toHaveBeenCalled();
      const item = mockBatchSet.mock.calls.map(([, d]) => d).find((d) => d?.variantId === 'v1');
      expect('personalization' in item).toBe(false);
    });
  });

  describe('customer snapshot', () => {
    it('freezes the customer\'s display name onto the order', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockUserDocGet.mockResolvedValue({ exists: true, data: () => ({ displayName: '  Asha Raman ' }) });
      await POST(makeRequest({ addressId: 'addr_1' }));
      expect(mockBatchCreate.mock.calls[0][1].customerName).toBe('Asha Raman');
    });

    it('still places the order when the profile is unreadable (best-effort snapshot)', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockUserDocGet.mockRejectedValue(new Error('firestore blip'));
      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(200);
      expect('customerName' in mockBatchCreate.mock.calls[0][1]).toBe(false);
    });
  });

  describe('order item snapshot', () => {
    it('freezes variant details and takes the title from the catalogue, not from the cart line', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockFindVariantById.mockReset();
      mockFindVariantById.mockResolvedValueOnce({
        id: 'v1', productId: 'p1', price: 1000, stockStatus: 'in_stock', isActive: true,
        sku: 'CWF-8x12-BLK', sizeLabel: '8x12 in', frameColour: 'Black', material: 'Solid wood', widthIn: 8, heightIn: 12,
      });
      mockProductDocGet.mockResolvedValue({ exists: true, id: 'p1', data: () => ({ title: 'Classic Wooden Photo Frame' }) });

      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(200);

      const itemWrite = mockBatchSet.mock.calls.map(([, data]) => data).find((d) => d?.variantId === 'v1');
      expect(itemWrite).toMatchObject({
        title: 'Classic Wooden Photo Frame', // cart line said "A"
        unitPrice: 1000,
        qty: 2,
        sku: 'CWF-8x12-BLK',
        sizeLabel: '8x12 in',
        frameColour: 'Black',
        material: 'Solid wood',
        widthIn: 8,
        heightIn: 12,
      });
    });
  });

  describe('concurrent duplicate submit', () => {
    it('uses a deterministic order id + create() with an idempotencyKey, and hands the loser of a race the winner\'s order', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      // The fast-path query saw nothing (both requests passed it), but create() collides.
      mockBatchCommit.mockRejectedValueOnce(Object.assign(new Error('ALREADY_EXISTS'), { code: 6 }));
      mockOrderDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ id: 'winner', orderNo: 'BP-2026-00007', status: 'pending_payment', paymentStatus: 'pending', paymentProvider: 'razorpay', razorpayOrderId: 'rzp_winner', total: 7000 }),
      });

      const response = await POST(makeRequest({ addressId: 'addr_1', idempotencyKey: 'attempt_race' }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({ orderId: 'winner', razorpayOrderId: 'rzp_winner', amount: 7000 });
      expect(mockBatchCreate).toHaveBeenCalledOnce();
    });

    it('rethrows a commit failure that is not an already-exists collision', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockBatchCommit.mockRejectedValueOnce(new Error('deadline exceeded'));
      await expect(POST(makeRequest({ addressId: 'addr_1', idempotencyKey: 'attempt_x' }))).rejects.toThrow('deadline exceeded');
    });
  });

  describe('failures before any side effect', () => {
    it('a foreign customization is rejected BEFORE the order number is consumed or a payment session is opened', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockCustomizationsWhereGet.mockResolvedValueOnce({ docs: [{ data: () => ({ userId: 'someone_else' }), ref: {} }] });

      const response = await POST(makeRequest({ addressId: 'addr_1' }));

      expect(response.status).toBe(404);
      expect(mockRunTransaction).not.toHaveBeenCalled();
      expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it('returns 502 and writes nothing when the payment provider fails to open a session', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      setUpValidCartAndAddress();
      mockCreateRazorpayOrder.mockReset();
      mockCreateRazorpayOrder.mockRejectedValueOnce(new Error('razorpay down'));

      const response = await POST(makeRequest({ addressId: 'addr_1' }));

      expect(response.status).toBe(502);
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });
  });

  describe('Combo Offers', () => {
    const combo = {
      id: 'triple-9', slug: 'triple-9', name: 'Triple 9 Combo', status: 'published', price: 99900, mrp: 199900, version: 2, couponsAllowed: false,
      items: [
        { id: 'small', productId: 'p_small', variantId: 'v_small', quantity: 1 },
        { id: 'large', productId: 'p_large', variantId: 'v_large', quantity: 1 },
      ],
    };
    const variants: Record<string, unknown> = {
      v_small: { id: 'v_small', productId: 'p_small', price: 40000, stockStatus: 'in_stock', isActive: true, sku: 'S', sizeLabel: '6x8', frameColour: 'Black', material: 'Wood', widthIn: 6, heightIn: 8 },
      v_large: { id: 'v_large', productId: 'p_large', price: 80000, stockStatus: 'in_stock', isActive: true, sku: 'L', sizeLabel: '12x18', frameColour: 'Black', material: 'Wood', widthIn: 12, heightIn: 18 },
    };
    const comboLine = (over: { frames?: Array<Record<string, unknown>>; version?: number } = {}) => ({
      variantId: 'combo:triple-9', personalizationId: 'inst_1', title: 'Triple 9 Combo', qty: 1,
      combo: {
        comboId: 'triple-9', version: over.version ?? 2, name: 'Triple 9 Combo',
        frames: over.frames ?? [
          { key: 'small-1', productId: 'p_small', variantId: 'v_small', personalizationId: 'pf_small' },
          { key: 'large-1', productId: 'p_large', variantId: 'v_large', personalizationId: 'pf_large' },
        ],
      },
    });
    const custDoc = (personalizationId: string) => ({ data: () => ({ userId: 'user_1', personalizationId, slotIndex: 0, status: 'draft' }), ref: {} });

    function arrange(items: unknown[]) {
      mockGetUserId.mockResolvedValueOnce('user_1');
      mockCartDoc.get.mockResolvedValueOnce({ exists: true, data: () => ({ items }) });
      mockAddressDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ id: 'addr_1', line1: '12 MG Road', city: 'Chennai', state: 'TN', pincode: '600001', phone: '+91123', label: null, line2: null, isDefault: true }),
      });
      mockComboDeps.loadCombo.mockResolvedValue(combo);
      mockComboDeps.loadVariant.mockImplementation(async (id: string) => variants[id] ?? null);
      mockComboDeps.isProductAvailable.mockResolvedValue(true);
      mockProductDocGet.mockImplementation(async (id: string) => ({ exists: true, id, data: () => ({ title: `Product ${id}`, photoSlots: 1 }) }));
      mockGetShippingSettings.mockResolvedValue({ freeShippingThreshold: 150000, flatShippingCharge: 5000 });
      mockRunTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<string>) => fn({ get: vi.fn().mockResolvedValue({ exists: false }), set: vi.fn() }));
      mockCreateRazorpayOrder.mockResolvedValueOnce({ id: 'order_rzp_combo' });
    }

    it('buys a combo as one charge for the combo price, written as one order item per frame plus a combo record', async () => {
      arrange([comboLine()]);
      mockCustomizationsWhereGet.mockResolvedValue({ docs: [custDoc('pf_small'), custDoc('pf_large')] });

      const response = await POST(makeRequest({ addressId: 'addr_1' }));

      expect(response.status).toBe(200);
      expect((await response.json()).amount).toBe(99900 + 5000); // the combo price, not the sum of its frames' own prices
      const items = mockBatchSet.mock.calls.map(([, d]) => d).filter((d) => d?.combo);
      expect(items).toHaveLength(2);
      expect(items.reduce((n, i) => n + i.unitPrice * i.qty, 0)).toBe(99900);
      expect(items[0]).toMatchObject({
        productId: 'p_small', variantId: 'v_small', personalizationId: 'pf_small', qty: 1, title: 'Product p_small', sku: 'S',
        combo: { instanceId: 'inst_1', comboId: 'triple-9', comboName: 'Triple 9 Combo', frameKey: 'small-1', frameLabel: 'Frame 1' },
      });
      const [, order] = mockBatchCreate.mock.calls[0];
      expect(order).toMatchObject({ subtotal: 99900, total: 104900, productIds: expect.arrayContaining(['p_small', 'p_large']) });
      expect(order.combos).toEqual([
        expect.objectContaining({
          instanceId: 'inst_1', comboId: 'triple-9', version: 2, name: 'Triple 9 Combo', price: 99900, mrp: 199900,
          frames: [
            expect.objectContaining({ key: 'small-1', label: 'Frame 1', variantId: 'v_small', orderItemId: 'item_id' }),
            expect.objectContaining({ key: 'large-1', label: 'Frame 2', variantId: 'v_large', orderItemId: 'item_id' }),
          ],
        }),
      ]);
      // each frame's draft customizations are locked to the order exactly like a single product's
      expect(mockBatchUpdate).toHaveBeenCalledWith(expect.anything(), { status: 'ordered' });
    });

    it('refuses a combo with an unfinished frame, before any order number or payment session', async () => {
      arrange([comboLine()]);
      mockCustomizationsWhereGet.mockResolvedValue({ docs: [custDoc('pf_small')] }); // the large frame has no photo

      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body).toMatchObject({ code: 'combo_incomplete', frames: ['Triple 9 Combo: Frame 2'] });
      expect(mockRunTransaction).not.toHaveBeenCalled();
      expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it('refuses a combo whose price or contents changed after it was added, naming the reason', async () => {
      arrange([comboLine({ version: 1 })]);
      const response = await POST(makeRequest({ addressId: 'addr_1' }));
      expect(response.status).toBe(409);
      expect((await response.json()).unavailable).toEqual([{ variantId: 'combo:triple-9', reason: 'combo_changed' }]);
      expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
    });

    it('finds a template frame\'s design inside its combo and verifies it, so it is not printed blank', async () => {
      const claim = { templateId: 'single-8x12', templateVersion: 1, state: { slots: {} } };
      arrange([comboLine({
        frames: [
          { key: 'small-1', productId: 'p_small', variantId: 'v_small', personalizationId: 'pf_small', personalization: claim },
          { key: 'large-1', productId: 'p_large', variantId: 'v_large', personalizationId: 'pf_large' },
        ],
      })]);
      mockCustomizationsWhereGet.mockResolvedValue({ docs: [custDoc('pf_large')] });
      mockBuildLineSnapshot.mockResolvedValueOnce(buildOrderSnapshot(singlePhotoTemplate, createEmptyState(singlePhotoTemplate.id, singlePhotoTemplate.version)));

      const response = await POST(makeRequest({ addressId: 'addr_1' }));

      expect(response.status).toBe(200);
      expect(mockBuildLineSnapshot).toHaveBeenCalledTimes(1);
      expect(mockBuildLineSnapshot.mock.calls[0]![2]).toMatchObject({ templateId: 'single-8x12', templateVersion: 1 });
      expect(mockBuildLineSnapshot.mock.calls[0]![3]).toMatchObject({ offeredTemplateId: null });
      const smallItem = mockBatchSet.mock.calls.map(([, d]) => d).find((d) => d?.personalizationId === 'pf_small');
      expect(smallItem?.personalization).toBeDefined(); // the verified snapshot reached the order item
    });

    it('rejects malformed combo lines: wrong quantity, no frames, a plain line pretending to be a combo, or combo data on a normal line', async () => {
      for (const bad of [
        { ...comboLine(), qty: 2 },
        { ...comboLine(), combo: { ...comboLine().combo, frames: [] } },
        { ...comboLine(), variantId: 'combo:someone-elses' },
        { variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 1, combo: comboLine().combo },
      ]) {
        mockGetUserId.mockResolvedValueOnce('user_1');
        mockCartDoc.get.mockResolvedValueOnce({ exists: true, data: () => ({ items: [bad] }) });
        const response = await POST(makeRequest({ addressId: 'addr_1' }));
        expect(response.status).toBe(400);
      }
      expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
    });

    it('does not let a combo be discounted by a coupon unless the combo allows it', async () => {
      arrange([comboLine()]);
      mockCustomizationsWhereGet.mockResolvedValue({ docs: [custDoc('pf_small'), custDoc('pf_large')] });
      mockFindCouponByCode.mockResolvedValue({ code: 'TEN', type: 'percent', value: 10, appliesTo: 'all', isActive: true, usageLimit: null, usedCount: 0, perUserLimit: 0, minOrderValue: 0, validFrom: null, validUntil: null });

      const response = await POST(makeRequest({ addressId: 'addr_1', couponCode: 'TEN' }));
      const body = await response.json();

      // A combo is already discounted, so the coupon is refused (said, not silently ignored) and nothing is charged.
      expect(response.status).toBe(409);
      expect(body.code).toBe('coupon_invalid');
      expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
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

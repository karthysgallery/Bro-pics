import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('server-only', () => ({}));

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

// Mock the Admin SDK Firestore surface this route needs: reading carts/{uid}
// and users/{uid}/addresses/{addressId}, running one transaction (order
// number counter), and one batch commit (order + order items).
const mockCartDoc = { get: vi.fn() };
const mockAddressDoc = { get: vi.fn() };
const mockBatchSet = vi.fn();
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
      return { id: id ?? 'generated_id', get: vi.fn(), collection: vi.fn(() => ({ doc: vi.fn(() => ({ id: 'item_id' })) })) };
    }),
  })),
  doc: vi.fn(() => ({})),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
  batch: () => ({ set: mockBatchSet, commit: mockBatchCommit }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

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
    mockAddressDoc.get.mockResolvedValueOnce({ exists: true, data: () => ({ line1: '12 MG Road', city: 'Chennai' }) });
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
  });
});

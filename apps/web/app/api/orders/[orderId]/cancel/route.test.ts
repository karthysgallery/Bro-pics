import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetUserId = vi.fn();
vi.mock('../../../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));

const mockWriteNotification = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/notify', () => ({ writeNotification: (...args: unknown[]) => mockWriteNotification(...args) }));

const mockTransactionGet = vi.fn();
const mockTransactionSet = vi.fn();
const mockTransactionUpdate = vi.fn();
const mockRunTransaction = vi.fn();
const mockDb = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({
      collection: vi.fn(() => ({ doc: vi.fn(() => ({ id: 'event_1' })) })),
    })),
  })),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/orders/order_1/cancel', {
    method: 'POST',
    headers: { Authorization: authHeader },
  });
}

describe('POST /api/orders/[orderId]/cancel', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ get: mockTransactionGet, set: mockTransactionSet, update: mockTransactionUpdate })
    );
  });

  it('returns 401 when signed out', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest(), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(401);
  });

  it('returns 404 when the order does not exist', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockTransactionGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest(), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(404);
  });

  it('returns 404 when the order belongs to a different user (never reveals it exists)', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockTransactionGet.mockResolvedValueOnce({ exists: true, data: () => ({ userId: 'someone_else', status: 'paid' }) });
    const response = await POST(makeRequest(), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(404);
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when the order is past the cancellable window', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockTransactionGet.mockResolvedValueOnce({ exists: true, data: () => ({ userId: 'user_1', status: 'shipped' }) });
    const response = await POST(makeRequest(), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(400);
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
  });

  it('cancels a cancellable order, writes an event, and updates status', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockTransactionGet.mockResolvedValueOnce({ exists: true, data: () => ({ userId: 'user_1', status: 'paid', orderNo: 'BP-2026-00001' }) });

    const response = await POST(makeRequest(), { params: Promise.resolve({ orderId: 'order_1' }) });

    expect(response.status).toBe(200);
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'cancelled', createdBy: 'user_1' })
    );
    expect(mockTransactionUpdate).toHaveBeenCalledWith(expect.anything(), { status: 'cancelled' });
    const body = await response.json();
    expect(body.status).toBe('cancelled');
    expect(mockWriteNotification).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      'order',
      'Order cancelled',
      expect.stringContaining('BP-2026-00001'),
      '/orders/order_1'
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const response = await POST(makeRequest(), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mockGetUserId).not.toHaveBeenCalled();
  });
});

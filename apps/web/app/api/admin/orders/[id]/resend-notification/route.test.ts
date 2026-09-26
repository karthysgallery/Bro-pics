import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockWriteNotification = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/notify', () => ({ writeNotification: (...args: unknown[]) => mockWriteNotification(...args) }));

const mockOrderGet = vi.fn();
const mockDb = { collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mockOrderGet })) })) };
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../lib/rate-limit';

function makeRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/orders/order_1/resend-notification', {
    method: 'POST',
    headers: { Authorization: authHeader },
  });
}

function makeParams(id = 'order_1') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/admin/orders/[id]/resend-notification', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 404 when the order does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockOrderGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(404);
  });

  it('returns 400 when the current status has no mapped notification', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'quality_check', userId: 'user_1', orderNo: 'BP-1' }) });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(400);
    expect(mockWriteNotification).not.toHaveBeenCalled();
  });

  it('resends the mapped notification for the current status', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'shipped', userId: 'user_1', orderNo: 'BP-2026-00001' }) });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(200);
    expect(mockWriteNotification).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      'shipping',
      'Order shipped',
      expect.stringContaining('BP-2026-00001'),
      '/orders/order_1'
    );
  });

  it('writes an audit log entry with the resent status', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'delivered', userId: 'user_1', orderNo: 'BP-1' }) });
    await POST(makeRequest(), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'staff_1', action: 'order.resend_notification', details: { status: 'delivered' } })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

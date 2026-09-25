import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockGet = vi.fn();
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mockGet })) })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../lib/rate-limit';

const template = { key: 'order.paid', subject: 'Order {{orderNo}} confirmed', body: 'Thanks {{customerName}}!', variables: ['orderNo', 'customerName'] };

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/notification-templates/order.paid/preview', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(key = 'order.paid') {
  return { params: Promise.resolve({ key }) };
}

describe('POST /api/admin/notification-templates/[key]/preview', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ exists: true, data: () => template });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await POST(makeRequest({}), makeParams());
    expect(response.status).toBe(401);
  });

  it('returns 404 when the template does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({}), makeParams());
    expect(response.status).toBe(404);
  });

  it('renders the subject and body with the given values', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ values: { orderNo: 'BP-2026-00001', customerName: 'Priya' } }), makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ key: 'order.paid', subject: 'Order BP-2026-00001 confirmed', body: 'Thanks Priya!' });
  });

  it('leaves an unresolved placeholder untouched', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ values: { orderNo: 'BP-1' } }), makeParams());
    const body = await response.json();
    expect(body.body).toContain('{{customerName}}');
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest({}), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

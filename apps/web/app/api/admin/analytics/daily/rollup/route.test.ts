import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn();
vi.mock('../../../../../../lib/audit-log', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

const mockSet = vi.fn();
const mockDoc = vi.fn(() => ({ set: mockSet }));
const mockQuery = {
  where: vi.fn().mockReturnThis(),
  get: vi.fn().mockResolvedValue({
    docs: [
      {
        id: 'ord_1',
        data: () => ({
          status: 'delivered',
          paymentStatus: 'paid',
          paymentMode: 'prepaid',
          total: 2000,
          userId: 'user_1',
        }),
        ref: {
          collection: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({
              docs: [
                {
                  data: () => ({
                    productId: 'prod_1',
                    title: 'Frame',
                    quantity: 1,
                    price: 2000,
                  }),
                },
              ],
            }),
          })),
        },
      },
    ],
  }),
};

const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'analyticsDaily') return { doc: mockDoc };
    return mockQuery;
  }),
  collectionGroup: vi.fn(() => ({
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ docs: [] }),
  })),
};

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../lib/rate-limit';

function makeRequest(body: unknown = {}): Request {
  return new Request('https://example.com/api/admin/analytics/daily/rollup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/analytics/daily/rollup (ABE-29 / ANL-05)', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 when lacking analytics:read permission', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid body schema', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const res = await POST(makeRequest({ date: 'invalid-date-format' }));
    expect(res.status).toBe(400);
  });

  it('executes rollup for specific date and writes doc + audit log', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const res = await POST(makeRequest({ date: '2026-09-25' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processedDays).toEqual(['2026-09-25']);

    expect(mockDoc).toHaveBeenCalledWith('2026-09-25');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '2026-09-25',
        date: '2026-09-25',
        reconciledOrderIds: ['ord_1'],
      })
    );
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        action: 'analytics.daily_rollup',
      })
    );
  });

  it('back-fills multiple dates when fromDate and toDate are given', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const res = await POST(
      makeRequest({ fromDate: '2026-09-23', toDate: '2026-09-25' })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processedDays).toEqual(['2026-09-23', '2026-09-24', '2026-09-25']);
    expect(mockDoc).toHaveBeenCalledTimes(3);
  });
});

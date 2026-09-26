import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

// Mock Firestore collections and queries
type QueryDoc = { id: string; data: () => Record<string, unknown> };

class MockCollectionQuery {
  private docs: QueryDoc[] = [];

  constructor(docs: QueryDoc[] = []) {
    this.docs = docs;
  }

  where(field: string, op: string, val: unknown): MockCollectionQuery {
    if (op === '==') {
      return new MockCollectionQuery(this.docs.filter((d) => d.data()[field] === val));
    }
    if (op === 'in' && Array.isArray(val)) {
      return new MockCollectionQuery(this.docs.filter((d) => val.includes(d.data()[field])));
    }
    if (op === '>=') {
      return new MockCollectionQuery(this.docs.filter((d) => (d.data()[field] as any) >= (val as any)));
    }
    if (op === '<=') {
      return new MockCollectionQuery(this.docs.filter((d) => (d.data()[field] as any) <= (val as any)));
    }
    return this;
  }

  async get() {
    return {
      docs: this.docs,
      size: this.docs.length,
    };
  }
}

let mockOrdersDocs: QueryDoc[] = [];
let mockPrintJobsDocs: QueryDoc[] = [];
let mockReturnsDocs: QueryDoc[] = [];
let mockReviewsDocs: QueryDoc[] = [];
let mockRefundsDocs: QueryDoc[] = [];

const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'orders') return new MockCollectionQuery(mockOrdersDocs);
    if (name === 'printJobs') return new MockCollectionQuery(mockPrintJobsDocs);
    if (name === 'returns') return new MockCollectionQuery(mockReturnsDocs);
    if (name === 'reviews') return new MockCollectionQuery(mockReviewsDocs);
    return new MockCollectionQuery([]);
  }),
  collectionGroup: vi.fn((name: string) => {
    if (name === 'refunds') return new MockCollectionQuery(mockRefundsDocs);
    return new MockCollectionQuery([]);
  }),
};

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

function makeRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/dashboard', {
    headers: { Authorization: authHeader },
  });
}

describe('GET /api/admin/dashboard (ABE-28 / ANL-02)', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();

    mockOrdersDocs = [
      {
        id: 'ord_1',
        data: () => ({
          paymentStatus: 'paid',
          total: 2500,
          status: 'in_production',
          placedAt: new Date(),
        }),
      },
      {
        id: 'ord_2',
        data: () => ({
          paymentStatus: 'paid',
          total: 1500,
          status: 'quality_check',
          placedAt: new Date(),
        }),
      },
      {
        id: 'ord_stuck',
        data: () => ({
          paymentStatus: 'pending',
          total: 1000,
          status: 'pending_payment',
          // placed 45 mins ago
          placedAt: new Date(Date.now() - 45 * 60 * 1000),
        }),
      },
      {
        id: 'ord_photo_val',
        data: () => ({
          paymentStatus: 'paid',
          total: 3000,
          status: 'photo_validation',
          placedAt: new Date(),
        }),
      },
    ];

    mockPrintJobsDocs = [
      { id: 'job_1', data: () => ({ status: 'queued' }) },
      { id: 'job_2', data: () => ({ status: 'failed' }) },
    ];

    mockReturnsDocs = [
      { id: 'ret_1', data: () => ({ status: 'requested' }) },
    ];

    mockReviewsDocs = [
      { id: 'rev_1', data: () => ({ status: 'pending' }) },
    ];

    mockRefundsDocs = [
      {
        id: 'ref_1',
        data: () => ({
          status: 'processed',
          amount: 500,
          processedAt: new Date(),
        }),
      },
    ];
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const res = await GET(makeRequest(''));
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller lacks analytics:read permission', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns 429 when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 10 });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it('returns comprehensive dashboard data when authorized', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();

    // 1. Today revenue & orders
    expect(body.today).toBeDefined();
    expect(body.today.orderCount).toBeGreaterThanOrEqual(2);
    expect(body.today.grossRevenue).toBeGreaterThan(0);
    expect(body.today.refundsTotal).toBe(500);
    expect(body.today.netRevenue).toBe(body.today.grossRevenue - 500);
    expect(body.today.aov).toBe(Math.round(body.today.netRevenue / body.today.orderCount));

    // 2. Stuck pending payment
    expect(body.stuckPendingPayment).toBeDefined();
    expect(body.stuckPendingPayment.count).toBe(1);
    expect(body.stuckPendingPayment.orderIds).toContain('ord_stuck');

    // 3. Photo validation / low-DPI alerts
    expect(body.photoValidation.count).toBe(1);
    expect(body.photoValidation.orderIds).toContain('ord_photo_val');
    expect(body.lowDpiAlerts.count).toBe(1);

    // 4. Render queue
    expect(body.renderQueue.queued).toBe(1);
    expect(body.renderQueue.failed).toBe(1);

    // 5. Production status counts
    expect(body.productionStatusCounts).toBeDefined();
    expect(body.productionStatusCounts.in_production).toBe(1);
    expect(body.productionStatusCounts.quality_check).toBe(1);
    expect(body.productionStatusCounts.photo_validation).toBe(1);

    // 6. Returns
    expect(body.returns.openCount).toBe(1);
    expect(body.returns.openReturnIds).toContain('ret_1');

    // 7. Reviews
    expect(body.reviews.pendingCount).toBe(1);

    // 8. Operational alerts
    expect(body.operationalAlerts).toBeDefined();
    expect(Array.isArray(body.operationalAlerts)).toBe(true);
    const types = body.operationalAlerts.map((a: { type: string }) => a.type);
    expect(types).toContain('stuck_payment');
    expect(types).toContain('photo_validation');
  });
});

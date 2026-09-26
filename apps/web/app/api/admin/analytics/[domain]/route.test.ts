import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockOrders = [
  {
    id: 'ord_1',
    ref: {
      collection: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          docs: [
            {
              data: () => ({
                productId: 'prod_1',
                title: 'Walnut Frame',
                quantity: 2,
                price: 1500,
              }),
            },
          ],
        }),
      })),
    },
    data: () => ({
      status: 'delivered',
      paymentStatus: 'paid',
      paymentMode: 'prepaid',
      total: 3000,
      discount: 200,
      shipping: 100,
      taxLines: [],
      userId: 'user_1',
      couponId: 'SAVE10',
      placedAt: new Date('2026-09-25T10:00:00Z'),
    }),
  },
  {
    id: 'ord_2',
    ref: {
      collection: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ docs: [] }),
      })),
    },
    data: () => ({
      status: 'cancelled',
      paymentStatus: 'failed',
      paymentMode: 'prepaid',
      total: 1000,
      discount: 0,
      shipping: 0,
      taxLines: [],
      userId: 'user_2',
      placedAt: new Date('2026-09-25T11:00:00Z'),
    }),
  },
];

const mockReturns = [
  {
    id: 'ret_1',
    data: () => ({ status: 'refunded', reasonCategory: 'damaged' }),
  },
];

const mockPrintJobs = [
  {
    id: 'pj_1',
    data: () => ({ status: 'done' }),
  },
];

const mockCustomizations = [
  {
    id: 'c_1',
    data: () => ({
      textFieldsJson: { name: { value: 'Ann' } },
      clipartId: 'star',
      dpiBand: 'green',
    }),
  },
];

const mockRefunds = [
  {
    id: 'ref_1',
    data: () => ({
      status: 'processed',
      amount: 400,
      processedAt: new Date('2026-09-25T12:00:00Z'),
    }),
  },
];

const mockDb = {
  collection: vi.fn((name: string) => ({
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockImplementation(async () => {
      if (name === 'orders') return { docs: mockOrders };
      if (name === 'returns') return { docs: mockReturns };
      if (name === 'printJobs') return { docs: mockPrintJobs };
      if (name === 'customizations') return { docs: mockCustomizations };
      return { docs: [] };
    }),
  })),
  collectionGroup: vi.fn((name: string) => ({
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockImplementation(async () => {
      if (name === 'refunds') return { docs: mockRefunds };
      return { docs: [] };
    }),
  })),
};

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeRequest(domain: string, query = ''): [Request, { params: Promise<{ domain: string }> }] {
  const req = new Request(`https://example.com/api/admin/analytics/${domain}${query}`, {
    headers: { Authorization: 'Bearer good-token' },
  });
  return [req, { params: Promise.resolve({ domain }) }];
}

describe('GET /api/admin/analytics/[domain] (ABE-30 / ANL-06/07)', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const [req, params] = makeRequest('sales');
    const res = await GET(req, params);
    expect(res.status).toBe(401);
  });

  it('returns 403 when lacking analytics:read permission', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const [req, params] = makeRequest('sales');
    const res = await GET(req, params);
    expect(res.status).toBe(403);
  });

  it('returns 400 for unknown domain', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const [req, params] = makeRequest('bogus-domain');
    const res = await GET(req, params);
    expect(res.status).toBe(400);
  });

  it('returns sales analytics with net revenue and trend', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const [req, params] = makeRequest('sales', '?from=2026-09-01&to=2026-09-30');
    const res = await GET(req, params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.domain).toBe('sales');
    expect(body.data.grossRevenue).toBe(3000);
    expect(body.data.totalRefunds).toBe(400);
    expect(body.data.netRevenue).toBe(2600);
    expect(body.data.paidOrderCount).toBe(1);
  });

  it('returns products analytics with top products', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const [req, params] = makeRequest('products');
    const res = await GET(req, params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.domain).toBe('products');
    expect(body.data.totalUnitsSold).toBe(2);
    expect(body.data.topProducts[0].productId).toBe('prod_1');
  });

  it('returns customers analytics with unique and top customers', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const [req, params] = makeRequest('customers');
    const res = await GET(req, params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.domain).toBe('customers');
    expect(body.data.uniqueCustomers).toBe(1);
    expect(body.data.topCustomers[0].userId).toBe('user_1');
  });

  it('returns marketing analytics with coupon performance', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const [req, params] = makeRequest('marketing');
    const res = await GET(req, params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.domain).toBe('marketing');
    expect(body.data.totalOrdersWithCoupon).toBe(1);
    expect(body.data.coupons[0].code).toBe('SAVE10');
  });

  it('returns personalization analytics with text & DPI distribution', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const [req, params] = makeRequest('personalization');
    const res = await GET(req, params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.domain).toBe('personalization');
    expect(body.data.totalCustomizations).toBe(1);
    expect(body.data.textPersonalizationCount).toBe(1);
    expect(body.data.dpiDistribution.green).toBe(1);
  });

  it('returns funnel analytics with conversion rates', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const [req, params] = makeRequest('funnel');
    const res = await GET(req, params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.domain).toBe('funnel');
    expect(body.data.ordersInitiated).toBe(2);
    expect(body.data.ordersPaid).toBe(1);
    expect(body.data.ordersCancelled).toBe(1);
    expect(body.data.conversionRate).toBe(0.5);
  });

  it('returns operations analytics with QC and returns metrics', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const [req, params] = makeRequest('operations');
    const res = await GET(req, params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.domain).toBe('operations');
    expect(body.data.returnsCount).toBe(1);
    expect(body.data.printJobs.done).toBe(1);
  });
});

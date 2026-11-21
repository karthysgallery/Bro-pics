import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequirePermission = vi.fn();
const mockContext = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
  getPermissionContext: (...a: unknown[]) => mockContext(...a),
}));
vi.mock('../../../../../lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn() }));

const order = {
  id: 'o1',
  data: () => ({
    orderNo: 'BP-2026-00020', userId: 'u1', status: 'pending_payment', paymentStatus: 'failed', paymentMode: 'prepaid', total: 55500,
    amountPaidOnline: 55500, amountDueOnDelivery: 0, placedAt: { toDate: () => new Date('2026-11-21T06:00:00Z') }, customerName: 'Arun K',
    addressJson: { recipientName: 'Arun K', phone: '+919000000012', city: 'Bengaluru', state: 'Karnataka', pincode: '560034' },
    productIds: ['p1', 'p2'], paymentFailure: { reason: 'Card declined', code: 'BAD_REQUEST_ERROR', at: '2026-11-21T06:02:00Z' },
  }),
};
const getAll = vi.fn(async (...refs: { path: string; id: string }[]) =>
  refs.map((r) =>
    r.path.startsWith('products/')
      ? { id: r.id, exists: true, data: () => ({ title: 'Your Photo Frame', primaryImageUrl: 'https://img/p1.jpg' }) }
      : { id: r.id, exists: true, data: () => ({ email: 'arun@example.com' }) }
  )
);
const db = {
  collection: (name: string) => ({
    orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [order], size: 1 }) }) }),
    doc: (id: string) => ({ id, path: `${name}/${id}` }),
  }),
  collectionGroup: () => ({
    limit: () => ({ get: async () => ({ size: 1, docs: [{ data: () => ({ status: 'processed', amount: 1000, orderId: 'o1' }), ref: { parent: { parent: { id: 'o1' } } } }] }) }),
  }),
  getAll,
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => db }));

import { GET } from './route';

describe('GET /api/admin/orders/overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({ ok: true, uid: 'a' });
  });

  it('returns list rows with payment kept apart from production, product and refunds', async () => {
    mockContext.mockResolvedValue({ authenticated: true, uid: 'a', role: 'admin' });
    const body = await (await GET(new Request('http://x/api/admin/orders/overview'))).json();
    expect(body.canSeeCustomers).toBe(true);
    expect(body.refundsUnavailable).toBe(false);
    expect(body.orders[0]).toMatchObject({
      orderNo: 'BP-2026-00020', status: 'pending_payment', paymentStatus: 'failed', customerName: 'Arun K', phone: '+919000000012',
      email: 'arun@example.com', productTitle: 'Your Photo Frame', productImage: 'https://img/p1.jpg', productCount: 2, refundedAmount: 1000,
      placedAt: '2026-11-21T06:00:00.000Z', paymentFailure: { reason: 'Card declined', code: 'BAD_REQUEST_ERROR' },
    });
  });

  it('leaves out email addresses for a role that cannot see customers', async () => {
    mockContext.mockResolvedValue({ authenticated: true, uid: 's', role: 'marketing_manager' });
    const body = await (await GET(new Request('http://x/api/admin/orders/overview'))).json();
    expect(body.orders[0].email).toBeNull();
    expect(getAll.mock.calls.some((c) => c.some((r: { path: string }) => r.path.startsWith('users/')))).toBe(false);
  });

  it('refuses callers without order access', async () => {
    mockRequirePermission.mockResolvedValue({ ok: false, status: 403 });
    const res = await GET(new Request('http://x/api/admin/orders/overview'));
    expect(res.status).toBe(403);
  });
});

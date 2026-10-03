import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

vi.mock('server-only', () => ({}));

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: any[]) => mockRequirePermission(...args),
}));

const mockCheckRateLimit = vi.fn(() => ({ allowed: true }));
vi.mock('../../../../lib/rate-limit', () => ({
  checkRateLimit: () => mockCheckRateLimit(),
}));

const mockGet = vi.fn();

const mockCollection = vi.fn(() => ({
  orderBy: vi.fn(() => ({
    limit: vi.fn(() => ({ get: mockGet })),
  })),
  where: vi.fn(() => ({
    limit: vi.fn(() => ({ get: mockGet })),
  })),
}));

const mockDb = {
  collection: mockCollection,
};

vi.mock('../../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockDb,
}));

describe('Audit Logs API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({ ok: true, status: 200, uid: 'admin_1', role: 'admin' });
    mockGet.mockResolvedValue({
      docs: [
        {
          id: 'aud_1',
          data: () => ({
            id: 'aud_1',
            actorUid: 'admin_1',
            action: 'product.publish',
            resource: 'product',
            resourceId: 'prod_123',
            createdAt: '2026-10-01T00:00:00.000Z',
          }),
        },
      ],
    });
  });

  it('GET /api/admin/audit returns audit logs array', async () => {
    const req = new Request('http://localhost:3000/api/admin/audit');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.logs).toHaveLength(1);
    expect(json.logs[0].action).toBe('product.publish');
  });

  it('GET /api/admin/audit rejects unauthorized staff without audit:read permission', async () => {
    mockRequirePermission.mockResolvedValue({ ok: false, status: 403 });
    const req = new Request('http://localhost:3000/api/admin/audit');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

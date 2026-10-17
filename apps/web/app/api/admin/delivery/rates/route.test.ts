import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PUT } from './route';

vi.mock('server-only', () => ({}));

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: any[]) => mockRequirePermission(...args),
}));

const mockCheckRateLimit = vi.fn(() => ({ allowed: true }));
vi.mock('../../../../../lib/rate-limit', () => ({
  checkRateLimit: () => mockCheckRateLimit(),
}));

const mockWriteAuditLog = vi.fn();
vi.mock('../../../../../lib/audit-log', () => ({
  writeAuditLog: (...args: any[]) => mockWriteAuditLog(...args),
}));

const mockGet = vi.fn();
const mockSet = vi.fn();

const mockDoc = vi.fn(() => ({
  get: mockGet,
  set: mockSet,
}));

const mockCollection = vi.fn(() => ({
  doc: mockDoc,
}));

const mockDb = {
  collection: mockCollection,
};

vi.mock('../../../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockDb,
}));

describe('Delivery Rates API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({ ok: true, status: 200, uid: 'staff_1', role: 'admin' });
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        freeShippingThreshold: 99900,
        defaultFlatRate: 9900,
        expressSurcharge: 15000,
        codConvenienceFee: 5000,
      }),
    });
  });

  it('GET /api/admin/delivery/rates returns shipping rates settings', async () => {
    const req = new Request('http://localhost:3000/api/admin/delivery/rates');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rates.freeShippingThreshold).toBe(99900);
    expect(json.rates.defaultFlatRate).toBe(9900);
  });

  it('PUT /api/admin/delivery/rates is retired: it saves nothing and points to the per-state settings', async () => {
    const req = new Request('http://localhost:3000/api/admin/delivery/rates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ freeShippingThreshold: 149900, defaultFlatRate: 9900, expressSurcharge: 19900, codConvenienceFee: 5000 }),
    });
    const res = await PUT();
    expect(res.status).toBe(410);
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
    void req;
  });
});

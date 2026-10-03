import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { POST as importPost } from './import/route';

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
const mockBatchCommit = vi.fn();
const mockBatchSet = vi.fn();
const mockBatch = vi.fn(() => ({ set: mockBatchSet, commit: mockBatchCommit }));

const mockCollection = vi.fn(() => ({
  limit: vi.fn(() => ({ get: mockGet })),
  get: mockGet,
  doc: vi.fn((id) => ({ id, set: mockSet })),
}));

const mockDb = {
  collection: mockCollection,
  batch: mockBatch,
};

vi.mock('../../../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockDb,
}));

describe('Delivery Serviceability API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({ ok: true, status: 200, uid: 'staff_1', role: 'admin' });
    mockGet.mockResolvedValue({
      docs: [
        {
          id: '560001',
          data: () => ({
            pincode: '560001',
            state: 'Karnataka',
            zone: 'metro',
            isServiceable: true,
            etaMinDays: 2,
            etaMaxDays: 3,
            codAvailable: true,
          }),
        },
      ],
    });
  });

  it('GET /api/admin/delivery/serviceability returns serviceability records', async () => {
    const req = new Request('http://localhost:3000/api/admin/delivery/serviceability');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.serviceability).toHaveLength(1);
    expect(json.serviceability[0].pincode).toBe('560001');
  });

  it('POST /api/admin/delivery/serviceability/import imports valid pincode batch', async () => {
    mockRequirePermission.mockResolvedValue({ ok: true, status: 200, uid: 'admin_1', role: 'admin' });
    const req = new Request('http://localhost:3000/api/admin/delivery/serviceability/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            pincode: '110001',
            state: 'Delhi',
            zone: 'metro',
            isServiceable: true,
            etaMinDays: 2,
            etaMaxDays: 4,
            codAvailable: true,
          },
        ],
      }),
    });

    const res = await importPost(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(1);
    expect(mockBatchCommit).toHaveBeenCalled();
  });
});

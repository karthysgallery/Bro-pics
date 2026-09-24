import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockGetAll = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn((id: string) => ({ id }));
const mockDb = {
  collection: vi.fn(() => ({ doc: mockDoc })),
  getAll: (...args: unknown[]) => mockGetAll(...args),
  batch: vi.fn(() => ({ update: mockBatchUpdate, commit: mockBatchCommit })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/banners/reorder', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/banners/reorder', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([{ id: 'banner_1', exists: true }, { id: 'banner_2', exists: true }]);
  });

  it('rejects an empty orderedIds array', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ orderedIds: [] }));
    expect(response.status).toBe(400);
  });

  it('rejects a duplicate id', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ orderedIds: ['banner_1', 'banner_1'] }));
    expect(response.status).toBe(400);
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it('returns 400 listing unknown ids', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockGetAll.mockResolvedValueOnce([{ id: 'banner_1', exists: true }, { id: 'banner_missing', exists: false }]);
    const response = await POST(makeRequest({ orderedIds: ['banner_1', 'banner_missing'] }));
    expect(response.status).toBe(400);
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it("batch-updates sortOrder to each id's index and commits", async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ orderedIds: ['banner_1', 'banner_2'] }));
    expect(response.status).toBe(200);
    expect(mockBatchUpdate).toHaveBeenCalledWith({ id: 'banner_1' }, { sortOrder: 0 });
    expect(mockBatchUpdate).toHaveBeenCalledWith({ id: 'banner_2' }, { sortOrder: 1 });
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest({ orderedIds: ['banner_1'] }));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

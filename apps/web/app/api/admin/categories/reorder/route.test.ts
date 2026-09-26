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
  return new Request('https://example.com/api/admin/categories/reorder', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/categories/reorder', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([{ id: 'cat_1', exists: true }, { id: 'cat_2', exists: true }]);
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await POST(makeRequest({ orderedIds: ['cat_1', 'cat_2'] }));
    expect(response.status).toBe(403);
  });

  it('rejects an empty orderedIds array', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ orderedIds: [] }));
    expect(response.status).toBe(400);
  });

  it('rejects a duplicate id in orderedIds', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ orderedIds: ['cat_1', 'cat_1'] }));
    expect(response.status).toBe(400);
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it('returns 400 listing unknown ids and does not commit', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockGetAll.mockResolvedValueOnce([{ id: 'cat_1', exists: true }, { id: 'cat_missing', exists: false }]);
    const response = await POST(makeRequest({ orderedIds: ['cat_1', 'cat_missing'] }));
    expect(response.status).toBe(400);
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it('batch-updates sortOrder to each id\'s index and commits', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ orderedIds: ['cat_1', 'cat_2'] }));
    expect(response.status).toBe(200);
    expect(mockBatchUpdate).toHaveBeenCalledWith({ id: 'cat_1' }, { sortOrder: 0 });
    expect(mockBatchUpdate).toHaveBeenCalledWith({ id: 'cat_2' }, { sortOrder: 1 });
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('writes an audit log entry on success', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ orderedIds: ['cat_1', 'cat_2'] }));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'category.reorder', resource: 'category' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest({ orderedIds: ['cat_1'] }));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

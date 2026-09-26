import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { POST } from './route';
import { revalidatePath } from 'next/cache';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockGetAll = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn((variantId: string) => ({ id: variantId }));
const mockVariantsCollection = vi.fn(() => ({ doc: mockDoc }));
const mockDb = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({ collection: mockVariantsCollection })),
  })),
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
  return new Request('https://example.com/api/admin/inventory/bulk-update', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validUpdates = [
  { productId: 'prod_1', variantId: 'var_1', stockStatus: 'out_of_stock' },
  { productId: 'prod_2', variantId: 'var_2', stockStatus: 'in_stock' },
];

describe('POST /api/admin/inventory/bulk-update', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([{ exists: true }, { exists: true }]);
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await POST(makeRequest({ updates: validUpdates }));
    expect(response.status).toBe(403);
  });

  it('rejects an empty updates array', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ updates: [] }));
    expect(response.status).toBe(400);
  });

  it('rejects an invalid stockStatus value', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ updates: [{ productId: 'p', variantId: 'v', stockStatus: 'sold_out' }] }));
    expect(response.status).toBe(400);
  });

  it('returns 400 listing missing product/variant pairs and does not commit', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockGetAll.mockResolvedValueOnce([{ exists: true }, { exists: false }]);
    const response = await POST(makeRequest({ updates: validUpdates }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain('prod_2/var_2');
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it('batch-updates stockStatus for every entry and commits', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ updates: validUpdates }));
    expect(response.status).toBe(200);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'var_1' }), { stockStatus: 'out_of_stock' });
    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'var_2' }), { stockStatus: 'in_stock' });
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body.updated).toBe(2);
  });

  it('writes an audit log entry with the count broken down by status', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ updates: validUpdates }));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorUid: 'admin_1',
        action: 'inventory.bulk_update',
        details: { count: 2, countByStatus: { out_of_stock: 1, in_stock: 1 } },
      })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest({ updates: validUpdates }));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });

  it('[ABE-09] revalidates the homepage on success', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ updates: validUpdates }));
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockCollectionGet = vi.fn();
const mockCollectionUpdate = vi.fn().mockResolvedValue(undefined);
const mockSlugQueryGet = vi.fn();
const mockDb = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({ get: mockCollectionGet, update: mockCollectionUpdate })),
    where: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockSlugQueryGet })) })),
  })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

const currentCollection = { id: 'col_1', name: 'New Arrivals', slug: 'new-arrivals', isActive: true, productIds: [] };

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/collections/col_1', {
    method: 'PATCH',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id = 'col_1') {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/collections/[id]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockCollectionGet.mockResolvedValue({ exists: true, data: () => currentCollection });
    mockSlugQueryGet.mockResolvedValue({ empty: true, docs: [] });
  });

  it('returns 404 when the collection does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockCollectionGet.mockResolvedValueOnce({ exists: false });
    const response = await PATCH(makeRequest({ name: 'x' }), makeParams());
    expect(response.status).toBe(404);
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ notAField: 'x' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('returns 409 when changing to a slug another collection already has', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockSlugQueryGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'col_other' }] });
    const response = await PATCH(makeRequest({ slug: 'taken' }), makeParams());
    expect(response.status).toBe(409);
  });

  it('updates productIds and uses collection.update as the audit action', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ productIds: ['prod_1'] }), makeParams());
    expect(response.status).toBe(200);
    expect(mockCollectionUpdate).toHaveBeenCalledWith(expect.objectContaining({ productIds: ['prod_1'] }));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'collection.update' }));
  });

  it('uses collection.archive as the audit action when isActive becomes false', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ isActive: false }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'collection.archive' }));
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await PATCH(makeRequest({ name: 'x' }), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

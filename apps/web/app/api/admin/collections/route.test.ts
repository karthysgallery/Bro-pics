import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockSlugQueryGet = vi.fn();
const mockCollectionSet = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn(() => ({
    where: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockSlugQueryGet })) })),
    doc: vi.fn(() => ({ id: 'col_new_1', set: mockCollectionSet })),
  })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

const validBody = { name: 'New Arrivals', slug: 'new-arrivals' };

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/collections', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/collections', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockSlugQueryGet.mockResolvedValue({ empty: true, docs: [] });
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ ...validBody, notAField: 'x' }));
    expect(response.status).toBe(400);
  });

  it('returns 409 when the slug already exists', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockSlugQueryGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'col_existing' }] });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(409);
    expect(mockCollectionSet).not.toHaveBeenCalled();
  });

  it('creates the collection with defaults filled in', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(201);
    expect(mockCollectionSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'col_new_1', name: 'New Arrivals', slug: 'new-arrivals', isActive: true, productIds: [] })
    );
  });

  it('writes an audit log entry on successful creation', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ ...validBody, productIds: ['prod_1', 'prod_2'] }));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'collection.create', details: expect.objectContaining({ productCount: 2 }) })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

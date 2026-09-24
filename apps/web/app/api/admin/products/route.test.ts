import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockSlugQueryGet = vi.fn();
const mockCategoryGet = vi.fn();
const mockProductSet = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'products') {
      return {
        where: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockSlugQueryGet })) })),
        doc: vi.fn(() => ({ id: 'prod_new_1', set: mockProductSet })),
      };
    }
    if (name === 'categories') {
      return { doc: vi.fn(() => ({ get: mockCategoryGet })) };
    }
    throw new Error(`unexpected collection: ${name}`);
  }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

const validBody = {
  title: 'Classic Frame',
  slug: 'classic-frame',
  categoryId: 'cat_1',
  shortDesc: 'A classic frame',
  basePrice: 99900,
};

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/products', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/products', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockSlugQueryGet.mockResolvedValue({ empty: true, docs: [] });
    mockCategoryGet.mockResolvedValue({ exists: true });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await POST(makeRequest(validBody, ''));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('unauthenticated');
  });

  it('returns 403 with the forbidden code for a wrong-role caller', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('forbidden');
  });

  it('returns 400 with issues for an invalid body', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ title: 'x' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.details.issues).toBeDefined();
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ ...validBody, notAField: 'x' }));
    expect(response.status).toBe(400);
  });

  it('returns 409 when the slug already exists', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockSlugQueryGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'prod_existing' }] });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('conflict');
    expect(mockProductSet).not.toHaveBeenCalled();
  });

  it('returns 400 when categoryId does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockCategoryGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(400);
    expect(mockProductSet).not.toHaveBeenCalled();
  });

  it('creates the product with derived isActive and denormalized safe defaults', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ ...validBody, status: 'published' }));
    expect(response.status).toBe(201);
    expect(mockProductSet).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'prod_new_1',
        title: 'Classic Frame',
        status: 'published',
        isActive: true,
        minPrice: 0,
        maxPrice: 0,
        availableSizes: [],
        ratingAverage: 0,
        ratingCount: 0,
        titleLower: 'classic frame',
        primaryImageUrl: '',
        hoverImageUrl: null,
      })
    );
  });

  it('defaults status to draft and isActive to false when status is omitted', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest(validBody));
    expect(mockProductSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', isActive: false }));
  });

  it('writes an audit log entry on successful creation', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest(validBody));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'product.create', resource: 'product', resourceId: 'prod_new_1' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

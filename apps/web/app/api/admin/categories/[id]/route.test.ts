import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockCategoryGet = vi.fn();
const mockCategoryUpdate = vi.fn().mockResolvedValue(undefined);
const mockSlugQueryGet = vi.fn();
const mockParentGet = vi.fn();
const mockActiveProductsGet = vi.fn();
const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'categories') {
      return {
        doc: vi.fn(() => ({ get: mockCategoryGet, update: mockCategoryUpdate })),
        where: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockSlugQueryGet })) })),
      };
    }
    if (name === 'products') {
      return { where: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockActiveProductsGet })) })) })) };
    }
    throw new Error(`unexpected collection: ${name}`);
  }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

const currentCategory = { id: 'cat_1', name: 'Wooden Frames', slug: 'wooden-frames', isActive: true };

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/categories/cat_1', {
    method: 'PATCH',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id = 'cat_1') {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/categories/[id]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockCategoryGet.mockResolvedValue({ exists: true, data: () => currentCategory });
    mockSlugQueryGet.mockResolvedValue({ empty: true, docs: [] });
    mockParentGet.mockResolvedValue({ exists: true });
    mockActiveProductsGet.mockResolvedValue({ empty: true, docs: [] });
  });

  it('returns 404 when the category does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockCategoryGet.mockResolvedValueOnce({ exists: false });
    const response = await PATCH(makeRequest({ name: 'x' }), makeParams());
    expect(response.status).toBe(404);
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ notAField: 'x' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('returns 400 when parentId equals its own id', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ parentId: 'cat_1' }), makeParams());
    expect(response.status).toBe(400);
    expect(mockCategoryUpdate).not.toHaveBeenCalled();
  });

  it('returns 409 when changing to a slug another category already has', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockSlugQueryGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'cat_other' }] });
    const response = await PATCH(makeRequest({ slug: 'taken-slug' }), makeParams());
    expect(response.status).toBe(409);
  });

  it('updates ordinary fields and uses category.update as the audit action', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ name: 'New Name' }), makeParams());
    expect(response.status).toBe(200);
    expect(mockCategoryUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name' }));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'category.update' }));
  });

  it('[ABE-05] blocks deactivating a category that still has active products', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockActiveProductsGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'prod_1' }] });
    const response = await PATCH(makeRequest({ isActive: false }), makeParams());
    expect(response.status).toBe(409);
    expect(mockCategoryUpdate).not.toHaveBeenCalled();
  });

  it('allows deactivating a category with no active products, using category.archive as the audit action', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ isActive: false }), makeParams());
    expect(response.status).toBe(200);
    expect(mockCategoryUpdate).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'category.archive' }));
  });

  it('does not check for active products when isActive is not changing to false', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ isActive: true }), makeParams());
    expect(mockActiveProductsGet).not.toHaveBeenCalled();
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await PATCH(makeRequest({ name: 'x' }), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

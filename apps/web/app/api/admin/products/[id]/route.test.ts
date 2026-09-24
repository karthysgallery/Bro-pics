import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { PATCH } from './route';
import { revalidatePath } from 'next/cache';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockProductGet = vi.fn();
const mockProductUpdate = vi.fn().mockResolvedValue(undefined);
const mockSlugQueryGet = vi.fn();
const mockCategoryGet = vi.fn();
const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'products') {
      return {
        doc: vi.fn(() => ({ get: mockProductGet, update: mockProductUpdate })),
        where: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockSlugQueryGet })) })),
      };
    }
    if (name === 'categories') {
      return { doc: vi.fn(() => ({ get: mockCategoryGet })) };
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

const currentProduct = {
  id: 'prod_1',
  title: 'Classic Frame',
  slug: 'classic-frame',
  categoryId: 'cat_1',
  shortDesc: 'A classic frame',
  status: 'draft',
  isActive: false,
};

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/products/prod_1', {
    method: 'PATCH',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id = 'prod_1') {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/products/[id]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockProductGet.mockResolvedValue({ exists: true, data: () => currentProduct });
    mockSlugQueryGet.mockResolvedValue({ empty: true, docs: [] });
    mockCategoryGet.mockResolvedValue({ exists: true, data: () => ({ slug: 'frames' }) });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await PATCH(makeRequest({ title: 'New title' }), makeParams());
    expect(response.status).toBe(401);
  });

  it('returns 404 when the product does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockProductGet.mockResolvedValueOnce({ exists: false });
    const response = await PATCH(makeRequest({ title: 'New title' }), makeParams());
    expect(response.status).toBe(404);
  });

  it('returns 400 for an invalid body', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ basePrice: 'not a number' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ notAField: 'x' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('archives via status: archived and derives isActive: false', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ status: 'archived' }), makeParams());
    expect(response.status).toBe(200);
    expect(mockProductUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived', isActive: false }));
  });

  it('publishes via status: published and derives isActive: true', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ status: 'published' }), makeParams());
    expect(mockProductUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'published', isActive: true }));
  });

  it('recomputes titleLower/searchTokens when title changes', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ title: 'Modern Frame' }), makeParams());
    expect(mockProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ titleLower: 'modern frame', searchTokens: expect.arrayContaining(['modern', 'frame']) })
    );
  });

  it('does not touch titleLower/searchTokens when neither title nor shortDesc changes', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ basePrice: 50000 }), makeParams());
    const updateArg = mockProductUpdate.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty('titleLower');
    expect(updateArg).not.toHaveProperty('searchTokens');
  });

  it('returns 409 when changing to a slug another product already has', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockSlugQueryGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'prod_other' }] });
    const response = await PATCH(makeRequest({ slug: 'taken-slug' }), makeParams());
    expect(response.status).toBe(409);
    expect(mockProductUpdate).not.toHaveBeenCalled();
  });

  it('allows re-saving the same slug the product already has without a conflict', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ slug: 'classic-frame' }), makeParams());
    expect(response.status).toBe(200);
    expect(mockSlugQueryGet).not.toHaveBeenCalled();
  });

  it('returns 400 when categoryId does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockCategoryGet.mockResolvedValueOnce({ exists: false });
    const response = await PATCH(makeRequest({ categoryId: 'cat_missing' }), makeParams());
    expect(response.status).toBe(400);
    expect(mockProductUpdate).not.toHaveBeenCalled();
  });

  it('uses the product.archive audit action when archiving, product.update otherwise', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ status: 'archived' }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'product.archive' }));

    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ basePrice: 1000 }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'product.update' }));
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await PATCH(makeRequest({ title: 'x' }), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });

  it('[ABE-09] revalidates the old and new slug pages when the slug changes, plus the homepage', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ slug: 'new-slug' }), makeParams());
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/product/classic-frame');
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/product/new-slug');
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/');
  });
});

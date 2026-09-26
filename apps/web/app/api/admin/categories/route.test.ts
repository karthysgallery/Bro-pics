import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { POST } from './route';
import { revalidatePath } from 'next/cache';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockSlugQueryGet = vi.fn();
const mockParentGet = vi.fn();
const mockCategorySet = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn(() => ({
    where: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockSlugQueryGet })) })),
    doc: vi.fn((docId?: string) =>
      docId ? { get: mockParentGet } : { id: 'cat_new_1', set: mockCategorySet }
    ),
  })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

const validBody = { name: 'Wooden Frames', slug: 'wooden-frames' };

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/categories', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/categories', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockSlugQueryGet.mockResolvedValue({ empty: true, docs: [] });
    mockParentGet.mockResolvedValue({ exists: true });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(401);
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ ...validBody, notAField: 'x' }));
    expect(response.status).toBe(400);
  });

  it('returns 409 when the slug already exists', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockSlugQueryGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'cat_existing' }] });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(409);
    expect(mockCategorySet).not.toHaveBeenCalled();
  });

  it('returns 400 when parentId does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockParentGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ ...validBody, parentId: 'cat_missing' }));
    expect(response.status).toBe(400);
    expect(mockCategorySet).not.toHaveBeenCalled();
  });

  it('creates the category with defaults filled in', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(201);
    expect(mockCategorySet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cat_new_1', name: 'Wooden Frames', slug: 'wooden-frames', isActive: true, sortOrder: 0, parentId: null })
    );
  });

  it('writes an audit log entry on successful creation', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest(validBody));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'category.create', resource: 'category', resourceId: 'cat_new_1' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });

  it('[ABE-09] revalidates the category page and the homepage on success', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest(validBody));
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/category/wooden-frames');
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/');
  });
});

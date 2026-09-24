import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

vi.mock('../../../../../lib/media-public-url', () => ({
  buildPublicMediaUrl: (path: string) => `https://public.example.com/${path}`,
}));

const mockMediaGet = vi.fn();
const mockMediaUpdate = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mockMediaGet, update: mockMediaUpdate })) })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

const currentMedia = { id: 'media_1', path: 'public/media/a.jpg', type: 'image', alt: 'Old alt', tags: [], usageRefs: [], isActive: true };

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/media/media_1', {
    method: 'PATCH',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id = 'media_1') {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/media/[id]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockMediaGet.mockResolvedValue({ exists: true, data: () => currentMedia });
  });

  it('returns 404 when the media asset does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockMediaGet.mockResolvedValueOnce({ exists: false });
    const response = await PATCH(makeRequest({ alt: 'New' }), makeParams());
    expect(response.status).toBe(404);
  });

  it('rejects an unknown field via strict() (path/type are not editable)', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ path: 'public/media/other.jpg' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('updates alt/tags and uses media.update as the audit action', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ alt: 'New alt', tags: ['hero'] }), makeParams());
    expect(response.status).toBe(200);
    expect(mockMediaUpdate).toHaveBeenCalledWith(expect.objectContaining({ alt: 'New alt', tags: ['hero'] }));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'media.update' }));
  });

  it('uses media.archive as the audit action when isActive becomes false', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ isActive: false }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'media.archive' }));
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await PATCH(makeRequest({ alt: 'x' }), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });

  it('[ABE-11] returns 409 with the referencing usageRefs when archiving an asset still in use', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockMediaGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...currentMedia, usageRefs: [{ resource: 'product', resourceId: 'prod_1' }] }),
    });
    const response = await PATCH(makeRequest({ isActive: false }), makeParams());
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.details.usageRefs).toEqual([{ resource: 'product', resourceId: 'prod_1' }]);
    expect(mockMediaUpdate).not.toHaveBeenCalled();
  });

  it('[ABE-11] allows archiving an in-use asset when force: true is passed', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockMediaGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...currentMedia, usageRefs: [{ resource: 'product', resourceId: 'prod_1' }] }),
    });
    const response = await PATCH(makeRequest({ isActive: false, force: true }), makeParams());
    expect(response.status).toBe(200);
    expect(mockMediaUpdate).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
  });

  it('[ABE-11] does not persist the force flag itself onto the document', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ alt: 'New alt', force: true }), makeParams());
    const updateArg = mockMediaUpdate.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty('force');
  });

  it('[ABE-11] archiving an asset with no usageRefs needs no force flag', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ isActive: false }), makeParams());
    expect(response.status).toBe(200);
    expect(mockMediaUpdate).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
  });
});

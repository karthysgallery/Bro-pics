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

const currentMedia = { id: 'media_1', path: 'public/media/a.jpg', type: 'image', alt: 'Old alt', tags: [], isActive: true };

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
});

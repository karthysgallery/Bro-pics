import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

vi.mock('../../../../lib/media-public-url', () => ({
  buildPublicMediaUrl: (path: string) => `https://public.example.com/${path}`,
}));

const mockMediaSet = vi.fn().mockResolvedValue(undefined);
const mockMediaGet = vi.fn();
const mockLimit = vi.fn(() => ({ get: mockMediaGet }));
const mockWhere = vi.fn(() => ({ where: mockWhere, limit: mockLimit }));
const mockDb = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({ id: 'media_new_1', set: mockMediaSet })),
    where: mockWhere,
    limit: mockLimit,
  })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

const validBody = { path: 'public/media/abc.jpg', type: 'image', alt: 'A photo' };

function makePostRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/media', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(query = '', authHeader = 'Bearer good-token'): Request {
  return new Request(`https://example.com/api/admin/media${query}`, { headers: { Authorization: authHeader } });
}

describe('POST /api/admin/media', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockMediaGet.mockResolvedValue({ docs: [] });
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makePostRequest({ ...validBody, notAField: 'x' }));
    expect(response.status).toBe(400);
  });

  it('rejects a path outside the public/ prefix', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makePostRequest({ ...validBody, path: 'uploads/abc.jpg' }));
    expect(response.status).toBe(400);
    expect(mockMediaSet).not.toHaveBeenCalled();
  });

  it('creates the media doc with usageRefs empty and isActive true', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makePostRequest(validBody));
    expect(response.status).toBe(201);
    expect(mockMediaSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'media_new_1', path: 'public/media/abc.jpg', usageRefs: [], isActive: true })
    );
    const body = await response.json();
    expect(body.media.url).toBe('https://public.example.com/public/media/abc.jpg');
  });

  it('writes an audit log entry on success', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makePostRequest(validBody));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'media.create', resource: 'media' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makePostRequest(validBody));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/media', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(401);
  });

  it('returns media with derived public urls', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockLimit.mockReturnValueOnce({
      get: vi.fn().mockResolvedValue({ docs: [{ data: () => ({ id: 'media_1', path: 'public/media/a.jpg', alt: 'A cat' }) }] }),
    });
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.media).toEqual([expect.objectContaining({ id: 'media_1', url: 'https://public.example.com/public/media/a.jpg' })]);
  });

  it('filters by alt text (case-insensitive substring) when q is given', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockLimit.mockReturnValueOnce({
      get: vi.fn().mockResolvedValue({
        docs: [
          { data: () => ({ id: 'media_1', path: 'public/media/a.jpg', alt: 'A cat playing' }) },
          { data: () => ({ id: 'media_2', path: 'public/media/b.jpg', alt: 'A dog sleeping' }) },
        ],
      }),
    });
    const response = await GET(makeGetRequest('?q=cat'));
    const body = await response.json();
    expect(body.media).toHaveLength(1);
    expect(body.media[0].id).toBe('media_1');
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

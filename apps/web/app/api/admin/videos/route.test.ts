import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockAddMediaUsageRef = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../lib/media-usage', () => ({
  addMediaUsageRef: (...args: unknown[]) => mockAddMediaUsageRef(...args),
  removeMediaUsageRef: vi.fn().mockResolvedValue(undefined),
}));

const mockMediaGet = vi.fn();
const mockProductGet = vi.fn();
const mockVideoSet = vi.fn().mockResolvedValue(undefined);
const mockVideosQueryGet = vi.fn();

const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'media') return { doc: vi.fn(() => ({ get: mockMediaGet })) };
    if (name === 'products') return { doc: vi.fn(() => ({ get: mockProductGet })) };
    if (name === 'videos') {
      return {
        doc: vi.fn(() => ({ id: 'video_new_1', set: mockVideoSet })),
        where: vi.fn(() => ({ where: vi.fn(() => ({ get: mockVideosQueryGet })), get: mockVideosQueryGet })),
        get: mockVideosQueryGet,
      };
    }
    throw new Error(`Unexpected collection: ${name}`);
  }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

const validBody = { mediaId: 'media_1', placement: 'homepage' };

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/videos', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/videos', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockMediaGet.mockResolvedValue({ exists: true, data: () => ({ type: 'video' }) });
    mockProductGet.mockResolvedValue({ exists: true });
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

  it('returns 400 when mediaId does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockMediaGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(400);
    expect(mockVideoSet).not.toHaveBeenCalled();
  });

  it('returns 400 when mediaId is not a video asset', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockMediaGet.mockResolvedValueOnce({ exists: true, data: () => ({ type: 'image' }) });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(400);
  });

  it('returns 400 when thumbnailMediaId is not an image asset', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockMediaGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ type: 'video' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ type: 'video' }) });
    const response = await POST(makeRequest({ ...validBody, thumbnailMediaId: 'media_2' }));
    expect(response.status).toBe(400);
  });

  it('returns 400 when productId does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockProductGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ ...validBody, productId: 'prod_missing' }));
    expect(response.status).toBe(400);
  });

  it('creates the video and attaches a media usage ref', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(201);
    expect(mockVideoSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'video_new_1', mediaId: 'media_1', placement: 'homepage' }));
    expect(mockAddMediaUsageRef).toHaveBeenCalledWith(expect.anything(), 'media_1', { resource: 'video', resourceId: 'video_new_1' });
  });

  it('writes an audit log entry on successful creation', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest(validBody));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'video.create', resource: 'video', resourceId: 'video_new_1' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/videos', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockVideosQueryGet.mockResolvedValue({
      docs: [
        { data: () => ({ id: 'video_2', sortOrder: 1 }) },
        { data: () => ({ id: 'video_1', sortOrder: 0 }) },
      ],
    });
  });

  function makeGetRequest(query = '', authHeader = 'Bearer good-token'): Request {
    return new Request(`https://example.com/api/admin/videos${query}`, { headers: { Authorization: authHeader } });
  }

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(403);
  });

  it('sorts results by sortOrder', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeGetRequest());
    const body = await response.json();
    expect(body.videos.map((v: { id: string }) => v.id)).toEqual(['video_1', 'video_2']);
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

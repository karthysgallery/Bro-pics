import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockAddMediaUsageRef = vi.fn().mockResolvedValue(undefined);
const mockRemoveMediaUsageRef = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/media-usage', () => ({
  addMediaUsageRef: (...args: unknown[]) => mockAddMediaUsageRef(...args),
  removeMediaUsageRef: (...args: unknown[]) => mockRemoveMediaUsageRef(...args),
}));

const mockVideoGet = vi.fn();
const mockVideoUpdate = vi.fn().mockResolvedValue(undefined);
const mockMediaGet = vi.fn();
const mockProductGet = vi.fn();

const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'videos') return { doc: vi.fn(() => ({ get: mockVideoGet, update: mockVideoUpdate })) };
    if (name === 'media') return { doc: vi.fn(() => ({ get: mockMediaGet })) };
    if (name === 'products') return { doc: vi.fn(() => ({ get: mockProductGet })) };
    throw new Error(`Unexpected collection: ${name}`);
  }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

const currentVideo = {
  id: 'video_1',
  mediaId: 'media_1',
  thumbnailMediaId: null,
  caption: 'Old caption',
  productId: null,
  placement: 'homepage',
  isActive: true,
  sortOrder: 0,
};

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/videos/video_1', {
    method: 'PATCH',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id = 'video_1') {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/videos/[id]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockVideoGet.mockResolvedValue({ exists: true, data: () => currentVideo });
    mockMediaGet.mockResolvedValue({ exists: true, data: () => ({ type: 'video' }) });
    mockProductGet.mockResolvedValue({ exists: true });
  });

  it('returns 404 when the video does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockVideoGet.mockResolvedValueOnce({ exists: false });
    const response = await PATCH(makeRequest({ caption: 'New caption' }), makeParams());
    expect(response.status).toBe(404);
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ notAField: 'x' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('updates only the given fields, no usage-ref churn when mediaId is unchanged', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ caption: 'New caption' }), makeParams());
    expect(response.status).toBe(200);
    expect(mockVideoUpdate).toHaveBeenCalledWith({ caption: 'New caption' });
    expect(mockAddMediaUsageRef).not.toHaveBeenCalled();
    expect(mockRemoveMediaUsageRef).not.toHaveBeenCalled();
  });

  it('re-points the usage ref when mediaId changes', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ mediaId: 'media_2' }), makeParams());
    expect(response.status).toBe(200);
    expect(mockRemoveMediaUsageRef).toHaveBeenCalledWith(expect.anything(), 'media_1', { resource: 'video', resourceId: 'video_1' });
    expect(mockAddMediaUsageRef).toHaveBeenCalledWith(expect.anything(), 'media_2', { resource: 'video', resourceId: 'video_1' });
  });

  it('returns 400 when the new mediaId is not a video asset', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockMediaGet.mockResolvedValueOnce({ exists: true, data: () => ({ type: 'image' }) });
    const response = await PATCH(makeRequest({ mediaId: 'media_2' }), makeParams());
    expect(response.status).toBe(400);
    expect(mockVideoUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when productId does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockProductGet.mockResolvedValueOnce({ exists: false });
    const response = await PATCH(makeRequest({ productId: 'prod_missing' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('writes an audit log entry with the changed field names', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ isActive: false }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'video.update', resourceId: 'video_1', details: { changedFields: ['isActive'] } })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await PATCH(makeRequest({ isActive: false }), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

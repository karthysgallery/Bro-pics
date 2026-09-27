// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSave = vi.fn().mockResolvedValue(undefined);
const mockFile = vi.fn(() => ({ save: mockSave }));

const mockGetUserId = vi.fn();
vi.mock('../../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn() }));
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ file: mockFile }) }),
}));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { POST } from './route';
import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

// 1x1 transparent PNG, base64-decoded into a real Blob — a valid (if tiny) PNG.
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function makeRequest(includeFile = true): Request {
  const formData = new FormData();
  if (includeFile) {
    const bytes = Buffer.from(TINY_PNG_BASE64, 'base64');
    formData.append('file', new Blob([bytes], { type: 'image/png' }), 'photo.png');
  } else {
    // An entirely empty FormData body doesn't reliably serialize with a
    // multipart Content-Type header — this keeps the body non-empty (a
    // harmless field the route ignores) so the "no file" case is actually
    // exercising the route's own validation, not a request-construction quirk.
    formData.append('note', 'no file attached');
  }
  return new Request('http://localhost/api/account/profile-picture', {
    method: 'POST',
    headers: { Authorization: 'Bearer good-token' },
    body: formData,
  });
}

describe('POST /api/account/profile-picture', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockSave.mockResolvedValue(undefined);
  });

  it('returns 401 when signed out', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
  });

  it('returns 400 when no file is attached', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    const response = await POST(makeRequest(false));
    expect(response.status).toBe(400);
  });

  it('stores the photo at a per-user fixed path and returns that path, not a signed URL', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(mockFile).toHaveBeenCalledWith('profile-pictures/user_1/photo.jpg');
    expect(mockSave).toHaveBeenCalled();
    const body = await response.json();
    expect(body.photoPath).toBe('profile-pictures/user_1/photo.jpg');
  });

  it('returns 429 and skips the upload entirely when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 8 });
    const response = await POST(makeRequest());
    expect(response.status).toBe(429);
    expect(mockGetUserId).not.toHaveBeenCalled();
  });
});

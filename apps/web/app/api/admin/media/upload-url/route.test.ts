import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockGetSignedUrl = vi.fn();
const mockFile = vi.fn(() => ({ getSignedUrl: mockGetSignedUrl }));
vi.mock('firebase-admin/storage', () => ({
  getStorage: vi.fn(() => ({ bucket: vi.fn(() => ({ file: mockFile })) })),
}));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/media/upload-url', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/media/upload-url', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockGetSignedUrl.mockResolvedValue(['https://signed.example.com/upload']);
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await POST(makeRequest({ fileName: 'x.jpg', contentType: 'image/jpeg' }));
    expect(response.status).toBe(403);
  });

  it('rejects a non-image/video contentType', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ fileName: 'x.pdf', contentType: 'application/pdf' }));
    expect(response.status).toBe(400);
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ fileName: 'x.jpg', contentType: 'image/jpeg', notAField: 'x' }));
    expect(response.status).toBe(400);
  });

  it('mints a signed write URL under a path in public/media/ containing the sanitized filename', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ fileName: 'my photo!.jpg', contentType: 'image/jpeg' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.uploadUrl).toBe('https://signed.example.com/upload');
    expect(body.path).toMatch(/^public\/media\/.+my_photo_\.jpg$/);
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'write', contentType: 'image/jpeg' })
    );
  });

  it('returns 429 and does not touch Storage when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest({ fileName: 'x.jpg', contentType: 'image/jpeg' }));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

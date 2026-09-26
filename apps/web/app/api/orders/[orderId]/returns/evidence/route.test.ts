// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockSave = vi.fn().mockResolvedValue(undefined);
const mockOrderGet = vi.fn();

vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn() }));
vi.mock('../../../../../../lib/verify-id-token', () => ({ getUserIdFromAuthHeader: vi.fn().mockResolvedValue(null) }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'orders') return { doc: () => ({ get: mockOrderGet }) };
      return { doc: () => ({ id: 'evidence_id_1' }) };
    },
  }),
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ file: () => ({ save: mockSave }) }) }),
}));

vi.mock('../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { POST } from './route';
import { getUserIdFromAuthHeader } from '../../../../../../lib/verify-id-token';
import { checkRateLimit, resetRateLimitState } from '../../../../../../lib/rate-limit';

const fixturesDir = join(__dirname, '..', '..', '..', '..', '..', '..', '__fixtures__');

function makeRequest(fileBuffer: Buffer, authHeader?: string): Request {
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(fileBuffer)], { type: 'image/jpeg' }), 'evidence.jpg');
  return new Request('http://localhost/api/orders/order_1/returns/evidence', {
    method: 'POST',
    headers: authHeader ? { Authorization: authHeader } : {},
    body: formData,
  });
}

describe('POST /api/orders/[orderId]/returns/evidence', () => {
  beforeEach(() => {
    resetRateLimitState();
    mockSave.mockClear();
    mockOrderGet.mockReset();
    vi.mocked(getUserIdFromAuthHeader).mockClear();
    vi.mocked(getUserIdFromAuthHeader).mockResolvedValue(null);
  });

  it('returns 401 when signed out', async () => {
    const buffer = readFileSync(join(fixturesDir, 'small-photo.jpg'));
    const response = await POST(makeRequest(buffer), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(401);
  });

  it('returns 404 when the order does not exist or belongs to someone else', async () => {
    vi.mocked(getUserIdFromAuthHeader).mockResolvedValue('user_1');
    mockOrderGet.mockResolvedValueOnce({ exists: false });
    const buffer = readFileSync(join(fixturesDir, 'small-photo.jpg'));
    const response = await POST(makeRequest(buffer, 'Bearer good-token'), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(404);
  });

  it('uploads a valid evidence photo and returns its Storage path', async () => {
    vi.mocked(getUserIdFromAuthHeader).mockResolvedValue('user_1');
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => ({ userId: 'user_1' }) });
    const buffer = readFileSync(join(fixturesDir, 'small-photo.jpg'));
    const response = await POST(makeRequest(buffer, 'Bearer good-token'), { params: Promise.resolve({ orderId: 'order_1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.path).toBe('returns/order_1/evidence_id_1/evidence.jpg');
    expect(mockSave).toHaveBeenCalled();
  });

  it('returns 400 for a malformed/undecodable image without uploading anything', async () => {
    vi.mocked(getUserIdFromAuthHeader).mockResolvedValue('user_1');
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => ({ userId: 'user_1' }) });
    const buffer = Buffer.from('this is not a valid image');
    const response = await POST(makeRequest(buffer, 'Bearer good-token'), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(400);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 5 });
    const buffer = readFileSync(join(fixturesDir, 'small-photo.jpg'));
    const response = await POST(makeRequest(buffer), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(429);
    expect(getUserIdFromAuthHeader).not.toHaveBeenCalled();
  });
});

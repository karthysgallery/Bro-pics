import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDocGet = vi.fn();
const mockUploadGet = vi.fn();
const mockCollectionGroupGet = vi.fn();

const draftCustomization = {
  id: 'cust_1',
  schemaVersion: 2,
  sessionId: 'sess_1',
  personalizationId: 'pers_1',
  uploadId: 'up_1',
  variantId: 'var_1',
  slotIndex: 0,
  transformJson: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, cropRect: { x: 0, y: 0, width: 3000, height: 3000 } },
  effectiveDpi: 300,
  dpiBand: 'green' as const,
  status: 'draft' as const,
  templateVersion: 1,
  renderStatus: 'pending' as const,
};

const uploadDoc = { id: 'up_1', sessionId: 'sess_1', widthPx: 3000, heightPx: 3000, mime: 'image/jpeg', bytes: 1, exifStripped: true, status: 'ready' as const, originalPath: 'uploads/sess_1/up_1/original.jpg' };
const variantDoc = { id: 'var_1', widthIn: 10, heightIn: 10 };

vi.mock('../../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'uploads') return { doc: () => ({ get: mockUploadGet }) };
      return { doc: () => ({ get: mockDocGet, set: mockSet }) };
    },
    collectionGroup: () => ({
      where: () => ({ limit: () => ({ get: mockCollectionGroupGet }) }),
    }),
  }),
}));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { PUT } from './route';
import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

function makeRequest(body: unknown, sessionId: string | null): Request {
  return new Request('http://localhost/api/customizations/cust_1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(sessionId ? { 'X-Session-Id': sessionId } : {}) },
    body: JSON.stringify(body),
  });
}

async function call(body: unknown, sessionId: string | null, id = 'cust_1') {
  return PUT(makeRequest(body, sessionId), { params: Promise.resolve({ id }) });
}

describe('PUT /api/customizations/[id]', () => {
  beforeEach(() => {
    resetRateLimitState();
    mockSet.mockClear();
    mockDocGet.mockReset().mockResolvedValue({ exists: true, data: () => draftCustomization });
    mockUploadGet.mockReset().mockResolvedValue({ exists: true, data: () => uploadDoc });
    mockCollectionGroupGet.mockReset().mockResolvedValue({ empty: false, docs: [{ data: () => variantDoc }] });
  });

  it('requires an X-Session-Id header', async () => {
    const response = await call({ clipartId: 'star' }, null);
    expect(response.status).toBe(400);
  });

  it('updates a mutable field on a draft and persists the full merged doc', async () => {
    const response = await call({ clipartId: 'star' }, 'sess_1');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.clipartId).toBe('star');
    expect(body.uploadId).toBe('up_1'); // unrelated fields survive the merge
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ clipartId: 'star', id: 'cust_1' }));
  });

  it('returns 404 for an unknown id', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false });
    const response = await call({ clipartId: 'star' }, 'sess_1');
    expect(response.status).toBe(404);
  });

  it('returns 403 for a session mismatch', async () => {
    const response = await call({ clipartId: 'star' }, 'sess_evil');
    expect(response.status).toBe(403);
  });

  it('returns 409 and refuses to edit a locked customization', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...draftCustomization, status: 'locked' }) });
    const response = await call({ clipartId: 'star' }, 'sess_1');
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.code).toBe('not_draft');
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('returns 409 and refuses to edit an ordered (unpaid) customization', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...draftCustomization, status: 'ordered' }) });
    const response = await call({ clipartId: 'star' }, 'sess_1');
    expect(response.status).toBe(409);
  });

  it('recomputes effectiveDpi/dpiBand server-side when transformJson changes, never trusting a client value', async () => {
    const response = await call(
      {
        transformJson: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, cropRect: { x: 0, y: 0, width: 100, height: 100 } },
        effectiveDpi: 999999,
      },
      'sess_1'
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.effectiveDpi).not.toBe(999999);
    expect(body.dpiBand).toBe('red');
  });

  it('sets redConfirmedAt when the recomputed crop is red-tier and confirmedLowDpi is sent', async () => {
    const response = await call(
      {
        transformJson: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, cropRect: { x: 0, y: 0, width: 100, height: 100 } },
        confirmedLowDpi: true,
      },
      'sess_1'
    );
    const body = await response.json();
    expect(body.dpiBand).toBe('red');
    expect(body.redConfirmedAt).toBeTruthy();
  });

  it('does not touch effectiveDpi/dpiBand when transformJson is not part of the update', async () => {
    const response = await call({ clipartId: 'heart' }, 'sess_1');
    const body = await response.json();
    expect(body.effectiveDpi).toBe(300);
    expect(body.dpiBand).toBe('green');
  });

  it('rejects a malformed transformJson (missing cropRect)', async () => {
    const response = await call({ transformJson: { scale: 1 } }, 'sess_1');
    expect(response.status).toBe(400);
  });

  it('returns 429 and does not read Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 9 });
    const response = await call({ clipartId: 'star' }, 'sess_1');
    expect(response.status).toBe(429);
    expect(mockDocGet).not.toHaveBeenCalled();
  });
});

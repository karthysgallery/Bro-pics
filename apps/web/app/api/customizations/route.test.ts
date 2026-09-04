import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSet = vi.fn().mockResolvedValue(undefined);

const uploadDoc = {
  id: 'up_1',
  sessionId: 'sess_1',
  originalUrl: 'https://storage.example.com/original.jpg',
  widthPx: 3000,
  heightPx: 3000,
  mime: 'image/jpeg',
  bytes: 12345,
  exifStripped: true,
  status: 'ready' as const,
};

const variantDoc = { id: 'var_1', widthIn: 10, heightIn: 10 };

const mockUploadGet = vi.fn().mockResolvedValue({ exists: true, data: () => uploadDoc });
const mockCollectionGroupGet = vi.fn().mockResolvedValue({ empty: false, docs: [{ data: () => variantDoc }] });

vi.mock('../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: vi.fn().mockResolvedValue(null),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'uploads') {
        return { doc: () => ({ get: mockUploadGet }) };
      }
      return { doc: () => ({ id: 'cust_test123', set: mockSet }) };
    },
    collectionGroup: () => ({
      where: () => ({
        limit: () => ({ get: mockCollectionGroupGet }),
      }),
    }),
  }),
}));

import { POST } from './route';
import { getUserIdFromAuthHeader } from '../../../lib/verify-id-token';

// scale 1 against a 3000x3000 upload and 10x10in variant -> 300 DPI exactly,
// so the server-recomputed effectiveDpi can be asserted precisely.
const validBody = {
  personalizationId: 'pers_1',
  uploadId: 'up_1',
  variantId: 'var_1',
  slotIndex: 0,
  transformJson: {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotationDeg: 0,
    cropRect: { x: 0, y: 0, width: 3000, height: 3000 },
  },
  effectiveDpi: 999999, // client-lied value — must be ignored and overwritten
  renderStatus: 'pending',
};

function makeRequest(body: unknown, sessionId: string | null, authHeader?: string): Request {
  return new Request('http://localhost/api/customizations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/customizations', () => {
  beforeEach(() => {
    mockSet.mockClear();
    mockUploadGet.mockClear();
    mockUploadGet.mockResolvedValue({ exists: true, data: () => uploadDoc });
    mockCollectionGroupGet.mockClear();
    mockCollectionGroupGet.mockResolvedValue({ empty: false, docs: [{ data: () => variantDoc }] });
    vi.mocked(getUserIdFromAuthHeader).mockClear();
    vi.mocked(getUserIdFromAuthHeader).mockResolvedValue(null);
  });

  it('requires an X-Session-Id header', async () => {
    const response = await POST(makeRequest({ ...validBody, sessionId: 'sess_1' }, null));
    expect(response.status).toBe(400);
  });

  it('creates a customization document, using the header sessionId and a server-recomputed effectiveDpi', async () => {
    const response = await POST(makeRequest({ ...validBody, sessionId: 'sess_should_be_ignored' }, 'sess_1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe('cust_test123');
    expect(body.sessionId).toBe('sess_1');
    expect(body.effectiveDpi).toBeCloseTo(300);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'cust_test123', sessionId: 'sess_1' }));
  });

  it('rejects a body that fails schema validation', async () => {
    const request = makeRequest(
      { ...validBody, transformJson: { ...validBody.transformJson, rotationDeg: 45 } },
      'sess_1'
    );
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('rejects when the referenced upload does not belong to the session in the header', async () => {
    mockUploadGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...uploadDoc, sessionId: 'sess_other' }) });
    const response = await POST(makeRequest(validBody, 'sess_1'));
    expect(response.status).toBe(403);
  });

  it('rejects when the referenced upload does not exist', async () => {
    mockUploadGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest(validBody, 'sess_1'));
    expect(response.status).toBe(400);
  });

  it('rejects when the referenced variant does not exist', async () => {
    mockCollectionGroupGet.mockResolvedValueOnce({ empty: true, docs: [] });
    const response = await POST(makeRequest(validBody, 'sess_1'));
    expect(response.status).toBe(400);
  });

  it('rejects when the referenced upload was rejected (too-small) rather than ready — Finding 3', async () => {
    mockUploadGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...uploadDoc, status: 'rejected' }) });
    const response = await POST(makeRequest(validBody, 'sess_1'));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/not ready/i);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('rejects when the referenced upload is still pending (not yet ready) — Finding 3', async () => {
    mockUploadGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...uploadDoc, status: 'pending' }) });
    const response = await POST(makeRequest(validBody, 'sess_1'));
    expect(response.status).toBe(400);
  });

  it('swaps variant width/height axes for a 90-degree rotation before computing DPI — Finding 4', async () => {
    // Non-square upload (4000w x 2000h) against a non-square 8x20in variant,
    // with a non-square crop rect (2000x4000) — as slotCropRectInOriginalPx
    // would produce for a 90-degree-rotated photo, where the crop rect's
    // width/height fields stay labeled in the ORIGINAL image's own u/v axes
    // (not the print's physical axes), so pairing cropRect.width with
    // variant.widthIn unswapped is wrong once the photo is rotated 90°.
    //
    // cropScale = max(4000/2000, 2000/4000) = 2 -> usedWidthPx=2000,
    // usedHeightPx=1000.
    // Unswapped (wrong):  min(2000/widthIn=8, 1000/heightIn=20) = min(250, 50)  = 50
    // Swapped   (correct): min(2000/heightIn=20, 1000/widthIn=8) = min(100, 125) = 100
    mockUploadGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...uploadDoc, widthPx: 4000, heightPx: 2000 }),
    });
    mockCollectionGroupGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ id: 'var_1', widthIn: 8, heightIn: 20 }) }],
    });

    const rotatedBody = {
      ...validBody,
      transformJson: {
        ...validBody.transformJson,
        rotationDeg: 90,
        // Crop rect in the upload's own pixel space: 2000 wide, 4000 tall
        // (the full upload, axes as they'd appear after a 90-degree crop
        // computation).
        cropRect: { x: 0, y: 0, width: 2000, height: 4000 },
      },
    };

    const response = await POST(makeRequest(rotatedBody, 'sess_1'));
    const body = await response.json();
    expect(response.status).toBe(200);

    // Swapped: printWidthIn = variant.heightIn (20), printHeightIn = variant.widthIn (8).
    // dpiFromWidth  = (4000 / (4000/2000)) / 20 = 2000 / 20 = 100
    // dpiFromHeight = (2000 / (4000/2000)) / 8  = 1000 / 8  = 125
    // effectiveDpi = min(100, 125) = 100
    expect(body.effectiveDpi).toBeCloseTo(100);

    // Sanity check against the WRONG (unswapped) value this test would
    // otherwise silently accept: unswapped would give
    // dpiFromWidth = 2000/8 = 250, dpiFromHeight = 1000/20 = 50 -> min = 50.
    expect(body.effectiveDpi).not.toBeCloseTo(50);
  });

  it('sets userId on the created customization when a valid Authorization header is present', async () => {
    vi.mocked(getUserIdFromAuthHeader).mockResolvedValueOnce('user_1');
    const response = await POST(makeRequest(validBody, 'sess_1', 'Bearer good-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.userId).toBe('user_1');
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_1' }));
  });

  it('omits userId when no Authorization header is present (unchanged pre-login behavior)', async () => {
    vi.mocked(getUserIdFromAuthHeader).mockResolvedValueOnce(null);
    const response = await POST(makeRequest(validBody, 'sess_1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.userId).toBeUndefined();
    expect(mockSet).toHaveBeenCalledWith(expect.not.objectContaining({ userId: expect.anything() }));
  });
});

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

function makeRequest(body: unknown, sessionId: string | null): Request {
  return new Request('http://localhost/api/customizations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
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
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockGetSignedReadUrl = vi.fn();
vi.mock('../../../../../../../../lib/storage-url', () => ({ getSignedReadUrl: (...args: unknown[]) => mockGetSignedReadUrl(...args) }));

const mockItemGet = vi.fn();
const mockOrderGet = vi.fn();
const mockCustomizationsGet = vi.fn();
const mockUploadGet = vi.fn();
const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'orders') {
      return { doc: vi.fn(() => ({ get: mockOrderGet, collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mockItemGet })) })) })) };
    }
    if (name === 'customizations') {
      return { where: vi.fn(() => ({ get: mockCustomizationsGet })) };
    }
    if (name === 'uploads') {
      return { doc: vi.fn(() => ({ get: mockUploadGet })) };
    }
    throw new Error(`unexpected collection: ${name}`);
  }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

const mockFileExists = vi.fn();
const mockBucketFile = vi.fn(() => ({ exists: mockFileExists }));
vi.mock('firebase-admin/storage', () => ({ getStorage: vi.fn(() => ({ bucket: vi.fn(() => ({ file: mockBucketFile })) })) }));

vi.mock('../../../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../../../lib/rate-limit';

function makeRequest(query: string, authHeader = 'Bearer good-token'): Request {
  return new Request(`https://example.com/api/admin/orders/order_1/items/item_1/download${query}`, {
    headers: { Authorization: authHeader },
  });
}

function makeParams(id = 'order_1', itemId = 'item_1') {
  return { params: Promise.resolve({ id, itemId }) };
}

describe('GET /api/admin/orders/[id]/items/[itemId]/download', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockItemGet.mockResolvedValue({ exists: true, data: () => ({ personalizationId: 'perso_1', previewPath: 'uploads/sess/previews/perso_1/slot-0.png' }) });
    mockOrderGet.mockResolvedValue({ exists: true, data: () => ({ orderNo: 'BP-2026-00001' }) });
    mockGetSignedReadUrl.mockResolvedValue('https://signed.example.com/x');
  });

  it('returns 400 for an invalid type', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await GET(makeRequest('?type=bogus'), makeParams());
    expect(response.status).toBe(400);
  });

  it('returns 404 when the item does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockItemGet.mockResolvedValueOnce({ exists: false });
    const response = await GET(makeRequest('?type=preview'), makeParams());
    expect(response.status).toBe(404);
  });

  it('signs the preview path directly off the item', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await GET(makeRequest('?type=preview'), makeParams());
    expect(response.status).toBe(200);
    expect(mockGetSignedReadUrl).toHaveBeenCalledWith('uploads/sess/previews/perso_1/slot-0.png', undefined, expect.stringMatching(/^BP-2026-00001-.*-preview\.png$/));
  });

  it('returns 404 for preview when the item has no previewPath', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockItemGet.mockResolvedValueOnce({ exists: true, data: () => ({ personalizationId: 'perso_1', previewPath: null }) });
    const response = await GET(makeRequest('?type=preview'), makeParams());
    expect(response.status).toBe(404);
  });

  it('resolves original via the lowest-slotIndex customization\'s upload', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockCustomizationsGet.mockResolvedValueOnce({
      docs: [
        { data: () => ({ uploadId: 'up_2', slotIndex: 1 }) },
        { data: () => ({ uploadId: 'up_1', slotIndex: 0 }) },
      ],
    });
    mockUploadGet.mockResolvedValueOnce({ exists: true, data: () => ({ originalPath: 'uploads/sess/up_1/original.jpg' }) });

    const response = await GET(makeRequest('?type=original'), makeParams());
    expect(response.status).toBe(200);
    expect(mockGetSignedReadUrl).toHaveBeenCalledWith('uploads/sess/up_1/original.jpg', undefined, expect.stringMatching(/photo-1-original\.jpg$/));
  });

  it('picks the photo asked for with ?upload=, so every photo of a collage can be downloaded', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockCustomizationsGet.mockResolvedValueOnce({
      docs: [
        { data: () => ({ uploadId: 'up_1', slotIndex: 0 }) },
        { data: () => ({ uploadId: 'up_2', slotIndex: 1 }) },
      ],
    });
    mockUploadGet.mockResolvedValueOnce({ exists: true, data: () => ({ originalPath: 'uploads/sess/up_2/original.png' }) });
    const response = await GET(makeRequest('?type=original&upload=up_2'), makeParams());
    expect(response.status).toBe(200);
    expect(mockGetSignedReadUrl).toHaveBeenCalledWith('uploads/sess/up_2/original.png', undefined, expect.stringMatching(/photo-2-original\.png$/));
  });

  it('refuses an upload id that is not one of this item\'s photos (no reading other customers\' photos)', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockCustomizationsGet.mockResolvedValueOnce({ docs: [{ data: () => ({ uploadId: 'up_1', slotIndex: 0 }) }] });
    const response = await GET(makeRequest('?type=original&upload=someone_elses'), makeParams());
    expect(response.status).toBe(404);
    expect(mockGetSignedReadUrl).not.toHaveBeenCalled();
  });

  it('finds the photos of a template-engine item in its personalization snapshot', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockItemGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ personalizationId: 'perso_1', title: 'Collage', personalization: { state: { slots: { a: { assetId: 'up_a' }, b: { assetId: 'up_b' } } } } }),
    });
    // Listing reads each photo's record (to spot cut-outs), then the download reads the chosen one.
    mockUploadGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ originalPath: 'uploads/sess/up_a/original.jpg' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ originalPath: 'uploads/sess/up_b/original.jpg' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ originalPath: 'uploads/sess/up_b/original.jpg' }) });
    const response = await GET(makeRequest('?type=original&upload=up_b'), makeParams());
    expect(response.status).toBe(200);
    expect(mockCustomizationsGet).not.toHaveBeenCalled();
    expect(mockGetSignedReadUrl).toHaveBeenCalledWith('uploads/sess/up_b/original.jpg', undefined, expect.stringMatching(/photo-2-original\.jpg$/));
  });

  it('returns 404 for original when no customization matches', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockCustomizationsGet.mockResolvedValueOnce({ docs: [] });
    const response = await GET(makeRequest('?type=original'), makeParams());
    expect(response.status).toBe(404);
  });

  it('signs the deterministic print path when the file exists', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFileExists.mockResolvedValueOnce([true]);
    const response = await GET(makeRequest('?type=print'), makeParams());
    expect(response.status).toBe(200);
    expect(mockBucketFile).toHaveBeenCalledWith('print-files/order_1/item_1/print.png');
    expect(mockGetSignedReadUrl).toHaveBeenCalledWith('print-files/order_1/item_1/print.png', undefined, expect.stringMatching(/PRINT-READY\.png$/));
  });

  it('returns 404 for print when the file does not exist yet', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFileExists.mockResolvedValueOnce([false]);
    const response = await GET(makeRequest('?type=print'), makeParams());
    expect(response.status).toBe(404);
    expect(mockGetSignedReadUrl).not.toHaveBeenCalled();
  });

  it('writes an audit log entry on every successful download', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    await GET(makeRequest('?type=preview'), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'staff_1', action: 'order.item_download', resourceId: 'item_1', details: { orderId: 'order_1', type: 'preview' } })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeRequest('?type=preview'), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

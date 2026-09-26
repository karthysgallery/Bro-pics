import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockOrderGet = vi.fn();
const mockItemsGet = vi.fn();
const mockFileExists = vi.fn();
const mockFileDownload = vi.fn();
const mockBucketFile = vi.fn(() => ({ exists: mockFileExists, download: mockFileDownload }));

const mockDb = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({ get: mockOrderGet, collection: vi.fn(() => ({ get: mockItemsGet })) })),
  })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('firebase-admin/storage', () => ({ getStorage: vi.fn(() => ({ bucket: vi.fn(() => ({ file: mockBucketFile })) })) }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeRequest(query: string, authHeader = 'Bearer good-token'): Request {
  return new Request(`https://example.com/api/admin/orders/bulk-print-files${query}`, { headers: { Authorization: authHeader } });
}

describe('GET /api/admin/orders/bulk-print-files', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockOrderGet.mockResolvedValue({ exists: true, data: () => ({ orderNo: 'BP-2026-00001' }) });
    mockItemsGet.mockResolvedValue({ docs: [{ id: 'item_1', data: () => ({ title: 'Frame', qty: 1 }) }] });
    mockFileExists.mockResolvedValue([true]);
    mockFileDownload.mockResolvedValue([Buffer.from('fake-png-bytes')]);
  });

  it('returns 400 for a missing orderIds query param', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await GET(makeRequest(''));
    expect(response.status).toBe(400);
  });

  it('returns 400 for more than 20 order ids', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const ids = Array.from({ length: 21 }, (_, i) => `order_${i}`).join(',');
    const response = await GET(makeRequest(`?orderIds=${ids}`));
    expect(response.status).toBe(400);
  });

  it('returns a zip attachment with the correct headers', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await GET(makeRequest('?orderIds=order_1'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/zip');
    expect(response.headers.get('Content-Disposition')).toContain('attachment; filename="print-files-');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('skips an order that does not exist without failing the whole request', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockOrderGet.mockResolvedValueOnce({ exists: false });
    const response = await GET(makeRequest('?orderIds=order_missing'));
    expect(response.status).toBe(200);
    expect(mockItemsGet).not.toHaveBeenCalled();
  });

  it('writes an audit log entry with requested count and items included', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    await GET(makeRequest('?orderIds=order_1'));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorUid: 'staff_1',
        action: 'order.bulk_print_files',
        details: { requested: 1, itemsIncluded: 1 },
      })
    );
  });

  it('counts a missing print file as not included, still lists it in the job sheet', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFileExists.mockResolvedValueOnce([false]);
    await GET(makeRequest('?orderIds=order_1'));
    expect(mockFileDownload).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ details: { requested: 1, itemsIncluded: 0 } })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeRequest('?orderIds=order_1'));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

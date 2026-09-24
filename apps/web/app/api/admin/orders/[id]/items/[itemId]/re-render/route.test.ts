import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockItemGet = vi.fn();
const mockJobGet = vi.fn();
const mockCustomizationsGet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockJobRef = { id: 'job_ref' };
const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'orders') {
      return { doc: vi.fn(() => ({ collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mockItemGet })) })) })) };
    }
    if (name === 'printJobs') {
      return { doc: vi.fn(() => ({ get: mockJobGet, ...mockJobRef })) };
    }
    if (name === 'customizations') {
      return { where: vi.fn(() => ({ get: mockCustomizationsGet })) };
    }
    throw new Error(`unexpected collection: ${name}`);
  }),
  batch: vi.fn(() => ({ update: mockBatchUpdate, commit: mockBatchCommit })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb, FieldValue: { delete: () => 'DELETE_SENTINEL' } }));
vi.mock('../../../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../../../lib/rate-limit';

function makeRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/orders/order_1/items/item_1/re-render', {
    method: 'POST',
    headers: { Authorization: authHeader },
  });
}

function makeParams(id = 'order_1', itemId = 'item_1') {
  return { params: Promise.resolve({ id, itemId }) };
}

describe('POST /api/admin/orders/[id]/items/[itemId]/re-render', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockItemGet.mockResolvedValue({ exists: true, data: () => ({ personalizationId: 'perso_1' }) });
    mockJobGet.mockResolvedValue({ exists: true });
    mockCustomizationsGet.mockResolvedValue({ docs: [{ ref: { id: 'cz_1' } }] });
  });

  it('returns 404 when the item does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockItemGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(404);
  });

  it('returns 404 when no print job exists for this item', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockJobGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(404);
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it('resets the print job to queued and clears its rendered fields', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(200);
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job_ref' }),
      expect.objectContaining({
        status: 'queued',
        attempts: 0,
        renderedFilePath: 'DELETE_SENTINEL',
        lastError: 'DELETE_SENTINEL',
        leasedAt: 'DELETE_SENTINEL',
        leaseExpiresAt: 'DELETE_SENTINEL',
      })
    );
  });

  it('resets every matching customization to renderStatus: pending', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    await POST(makeRequest(), makeParams());
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      { id: 'cz_1' },
      { renderStatus: 'pending', renderedFilePath: 'DELETE_SENTINEL' }
    );
  });

  it('writes an audit log entry on success', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    await POST(makeRequest(), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'staff_1', action: 'order.item_rerender', resourceId: 'item_1', details: { orderId: 'order_1' } })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

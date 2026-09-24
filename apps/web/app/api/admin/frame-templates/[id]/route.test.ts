import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockFindVariantById = vi.fn();
vi.mock('../../../../../lib/variant-lookup', () => ({ findVariantById: (...args: unknown[]) => mockFindVariantById(...args) }));

const mockTransactionGet = vi.fn();
const mockTransactionUpdate = vi.fn();
const mockRunTransaction = vi.fn();
const mockDoc = vi.fn((docId: string) => ({ id: docId }));
const mockWhere = vi.fn(() => ({ where: mockWhere }));
const mockTemplatesRef = { doc: mockDoc, where: mockWhere };
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ collection: vi.fn(() => mockTemplatesRef) })) })),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/frame-templates/tpl_1', {
    method: 'PATCH',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id = 'tpl_1') {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/frame-templates/[id]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockFindVariantById.mockResolvedValue({ id: 'var_1', productId: 'prod_1' });
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ get: mockTransactionGet, update: mockTransactionUpdate })
    );
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ variantId: 'var_1', isCurrent: true, notAField: 'x' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('returns 400 when the variant does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockFindVariantById.mockResolvedValueOnce(null);
    const response = await PATCH(makeRequest({ variantId: 'var_1', isCurrent: true }), makeParams());
    expect(response.status).toBe(400);
  });

  it('returns 404 when the template does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockTransactionGet.mockResolvedValueOnce({ exists: false });
    const response = await PATCH(makeRequest({ variantId: 'var_1', isCurrent: true }), makeParams());
    expect(response.status).toBe(404);
  });

  it('returns 400 when the template belongs to a different variant', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockTransactionGet.mockResolvedValueOnce({ exists: true, data: () => ({ variantId: 'var_other', version: 1 }) });
    const response = await PATCH(makeRequest({ variantId: 'var_1', isCurrent: true }), makeParams());
    expect(response.status).toBe(400);
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
  });

  it('activating flips other isCurrent siblings to false but skips itself and non-matching variants', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockTransactionGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ variantId: 'var_1', version: 2 }) })
      .mockResolvedValueOnce({
        docs: [
          { id: 'tpl_old', ref: { id: 'tpl_old' } },
          { id: 'tpl_1', ref: { id: 'tpl_1' } },
        ],
      });

    const response = await PATCH(makeRequest({ variantId: 'var_1', isCurrent: true }), makeParams());

    expect(response.status).toBe(200);
    expect(mockTransactionUpdate).toHaveBeenCalledWith({ id: 'tpl_old' }, { isCurrent: false });
    expect(mockTransactionUpdate).not.toHaveBeenCalledWith({ id: 'tpl_1' }, { isCurrent: false });
    expect(mockTransactionUpdate).toHaveBeenCalledWith({ id: 'tpl_1' }, { isCurrent: true });
  });

  it('deactivating does not query for siblings at all', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockTransactionGet.mockResolvedValueOnce({ exists: true, data: () => ({ variantId: 'var_1', version: 2 }) });

    const response = await PATCH(makeRequest({ variantId: 'var_1', isCurrent: false }), makeParams());

    expect(response.status).toBe(200);
    expect(mockTransactionGet).toHaveBeenCalledTimes(1);
    expect(mockTransactionUpdate).toHaveBeenCalledWith({ id: 'tpl_1' }, { isCurrent: false });
  });

  it('writes frame_template.activate / .deactivate as the audit action', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockTransactionGet.mockResolvedValueOnce({ exists: true, data: () => ({ variantId: 'var_1', version: 2 }) });
    await PATCH(makeRequest({ variantId: 'var_1', isCurrent: false }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'frame_template.deactivate' }));
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await PATCH(makeRequest({ variantId: 'var_1', isCurrent: true }), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

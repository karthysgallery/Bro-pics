import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockVariantGet = vi.fn();
const mockVariantUpdate = vi.fn().mockResolvedValue(undefined);
const mockSkuQueryGet = vi.fn();
const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'products') {
      return {
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            doc: vi.fn(() => ({ get: mockVariantGet, update: mockVariantUpdate })),
            where: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockSkuQueryGet })) })),
          })),
        })),
      };
    }
    throw new Error(`unexpected collection: ${name}`);
  }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../../lib/rate-limit';

const currentVariant = { id: 'var_1', productId: 'prod_1', sku: 'SKU-1', widthIn: 8, heightIn: 10, price: 99900 };

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/products/prod_1/variants/var_1', {
    method: 'PATCH',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id = 'prod_1', variantId = 'var_1') {
  return { params: Promise.resolve({ id, variantId }) };
}

describe('PATCH /api/admin/products/[id]/variants/[variantId]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockVariantGet.mockResolvedValue({ exists: true, data: () => currentVariant });
    mockSkuQueryGet.mockResolvedValue({ empty: true, docs: [] });
  });

  it('returns 404 when the variant does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockVariantGet.mockResolvedValueOnce({ exists: false });
    const response = await PATCH(makeRequest({ price: 1000 }), makeParams());
    expect(response.status).toBe(404);
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ notAField: 'x' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('returns 409 when changing to a SKU another variant on this product already has', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockSkuQueryGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'var_other' }] });
    const response = await PATCH(makeRequest({ sku: 'TAKEN' }), makeParams());
    expect(response.status).toBe(409);
  });

  it('re-derives print pixel fields when widthIn changes', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ widthIn: 12 }), makeParams());
    expect(mockVariantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ widthIn: 12, printWidthPx: 3600, printHeightPx: 3000, aspectRatio: 1.2 })
    );
  });

  it('does not touch print pixel fields when widthIn/heightIn are unchanged', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ price: 50000 }), makeParams());
    const updateArg = mockVariantUpdate.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty('printWidthPx');
    expect(updateArg).not.toHaveProperty('aspectRatio');
  });

  it('writes an audit log entry on success', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ price: 50000 }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'variant.update', resource: 'variant', resourceId: 'var_1' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await PATCH(makeRequest({ price: 1 }), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

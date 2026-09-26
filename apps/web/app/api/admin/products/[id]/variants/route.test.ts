import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { POST } from './route';
import { revalidatePath } from 'next/cache';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockProductGet = vi.fn();
const mockSkuQueryGet = vi.fn();
const mockVariantSet = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'products') {
      return {
        doc: vi.fn(() => ({
          get: mockProductGet,
          collection: vi.fn(() => ({
            where: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockSkuQueryGet })) })),
            doc: vi.fn(() => ({ id: 'var_new_1', set: mockVariantSet })),
          })),
        })),
      };
    }
    throw new Error(`unexpected collection: ${name}`);
  }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../lib/rate-limit';

const validBody = { sku: 'SKU-1', sizeLabel: '8x10', widthIn: 8, heightIn: 10, price: 99900 };

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/products/prod_1/variants', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id = 'prod_1') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/admin/products/[id]/variants', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockProductGet.mockResolvedValue({ exists: true, data: () => ({ slug: 'classic-frame' }) });
    mockSkuQueryGet.mockResolvedValue({ empty: true, docs: [] });
  });

  it('returns 404 when the product does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockProductGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest(validBody), makeParams());
    expect(response.status).toBe(404);
  });

  it('rejects an unknown field via strict() (including server-derived print pixel fields)', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ ...validBody, printWidthPx: 2400 }), makeParams());
    expect(response.status).toBe(400);
  });

  it('returns 409 when the SKU already exists on this product', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockSkuQueryGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'var_existing' }] });
    const response = await POST(makeRequest(validBody), makeParams());
    expect(response.status).toBe(409);
    expect(mockVariantSet).not.toHaveBeenCalled();
  });

  it('derives printWidthPx/printHeightPx/minUploadPx/aspectRatio from widthIn/heightIn at 300 DPI', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest(validBody), makeParams());
    expect(response.status).toBe(201);
    expect(mockVariantSet).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'var_new_1',
        productId: 'prod_1',
        printWidthPx: 2400,
        printHeightPx: 3000,
        minUploadPx: 2400,
        aspectRatio: 0.8,
      })
    );
  });

  it('writes an audit log entry on successful creation', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest(validBody), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'variant.create', resource: 'variant', resourceId: 'var_new_1' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest(validBody), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });

  it('[ABE-09] revalidates the parent product page on success', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest(validBody), makeParams());
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/product/classic-frame');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockProductGet = vi.fn();
const mockExistingVariantsGet = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
let variantDocCounter = 0;
const mockVariantsCollection = {
  get: mockExistingVariantsGet,
  doc: vi.fn(() => ({ id: `var_new_${++variantDocCounter}` })),
};
const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'products') {
      return {
        doc: vi.fn(() => ({
          get: mockProductGet,
          collection: vi.fn(() => mockVariantsCollection),
        })),
      };
    }
    throw new Error(`unexpected collection: ${name}`);
  }),
  batch: vi.fn(() => ({ set: mockBatchSet, commit: mockBatchCommit })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../../lib/rate-limit';

const variantInput = { sku: 'SKU-1', sizeLabel: '8x10', widthIn: 8, heightIn: 10, price: 99900 };

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/products/prod_1/variants/bulk', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id = 'prod_1') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/admin/products/[id]/variants/bulk', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    variantDocCounter = 0;
    mockProductGet.mockResolvedValue({ exists: true });
    mockExistingVariantsGet.mockResolvedValue({ docs: [] });
  });

  it('returns 404 when the product does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockProductGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ variants: [variantInput] }), makeParams());
    expect(response.status).toBe(404);
  });

  it('rejects an empty variants array', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ variants: [] }), makeParams());
    expect(response.status).toBe(400);
  });

  it('rejects a duplicate SKU within the same payload', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ variants: [variantInput, variantInput] }), makeParams());
    expect(response.status).toBe(400);
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it('returns 409 listing SKUs that already exist on the product', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockExistingVariantsGet.mockResolvedValueOnce({ docs: [{ data: () => ({ sku: 'SKU-1' }) }] });
    const response = await POST(makeRequest({ variants: [variantInput] }), makeParams());
    expect(response.status).toBe(409);
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it('batch-creates every variant with derived print pixel fields', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const second = { ...variantInput, sku: 'SKU-2' };
    const response = await POST(makeRequest({ variants: [variantInput, second] }), makeParams());
    expect(response.status).toBe(201);
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body.variants).toHaveLength(2);
    expect(body.variants[0]).toEqual(expect.objectContaining({ printWidthPx: 2400, printHeightPx: 3000 }));
  });

  it('writes a single audit log entry with the batch count', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ variants: [variantInput] }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'variant.bulk_create', details: expect.objectContaining({ count: 1 }) })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest({ variants: [variantInput] }), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

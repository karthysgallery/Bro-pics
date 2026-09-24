import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockFindVariantById = vi.fn();
vi.mock('../../../../lib/variant-lookup', () => ({ findVariantById: (...args: unknown[]) => mockFindVariantById(...args) }));

const mockTransactionGet = vi.fn();
const mockTransactionSet = vi.fn();
const mockTransactionUpdate = vi.fn();
const mockRunTransaction = vi.fn();
const mockWhere = vi.fn(() => ({ where: mockWhere, limit: vi.fn(() => 'THE_QUERY') }));
const mockTemplatesRef = {
  doc: vi.fn(() => ({ id: 'tpl_new_1' })),
  where: mockWhere,
};
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ collection: vi.fn(() => mockTemplatesRef) })) })),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

const validBody = {
  variantId: 'var_1',
  mockupUrl: '/placeholders/mockups/frame.png',
  printableRects: [{ slotIndex: 0, x: 0.1, y: 0.1, width: 0.8, height: 0.8 }],
  bleedMm: 3,
  matInset: 0,
};

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/frame-templates', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/frame-templates', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockFindVariantById.mockResolvedValue({ id: 'var_1', productId: 'prod_1' });
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ get: mockTransactionGet, set: mockTransactionSet, update: mockTransactionUpdate })
    );
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ ...validBody, notAField: 'x' }));
    expect(response.status).toBe(400);
  });

  it('rejects a body with no printableRects', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ ...validBody, printableRects: [] }));
    expect(response.status).toBe(400);
  });

  it('returns 400 when the variant does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockFindVariantById.mockResolvedValueOnce(null);
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('creates version 1 with isCurrent: true when no current template exists yet', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockTransactionGet.mockResolvedValueOnce({ empty: true, docs: [] });

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(201);
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tpl_new_1' }),
      expect.objectContaining({ version: 1, isCurrent: true, variantId: 'var_1' })
    );
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.frameTemplate.version).toBe(1);
  });

  it('increments the version and flips the old isCurrent doc to false when one already exists', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const oldRef = { id: 'tpl_old_1' };
    mockTransactionGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ ref: oldRef, data: () => ({ version: 3, isCurrent: true, variantId: 'var_1' }) }],
    });

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(201);
    expect(mockTransactionUpdate).toHaveBeenCalledWith(oldRef, { isCurrent: false });
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tpl_new_1' }),
      expect.objectContaining({ version: 4, isCurrent: true })
    );
    const body = await response.json();
    expect(body.frameTemplate.version).toBe(4);
  });

  it('writes an audit log entry with the variantId and new version', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockTransactionGet.mockResolvedValueOnce({ empty: true, docs: [] });
    await POST(makeRequest(validBody));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorUid: 'admin_1',
        action: 'frame_template.create_version',
        details: { variantId: 'var_1', version: 1 },
      })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

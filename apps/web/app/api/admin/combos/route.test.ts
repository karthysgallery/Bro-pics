import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { GET, POST } from './route';
import { PATCH, DELETE } from './[id]/route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({ requirePermission: (...args: unknown[]) => mockRequirePermission(...args) }));
const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockSlugQuery = vi.fn();
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDocGet = vi.fn();
const mockListGet = vi.fn();
const mockDb = {
  collection: vi.fn(() => ({
    where: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockSlugQuery })) })),
    doc: vi.fn((id?: string) => ({ id: id ?? 'combo_new', set: mockSet, get: mockDocGet })),
    get: mockListGet,
  })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

const mockCheckPublishable = vi.fn();
vi.mock('../../../../lib/combo-publish-check', () => ({ checkComboPublishable: (...args: unknown[]) => mockCheckPublishable(...args) }));
vi.mock('../../../../lib/firestore-combos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/firestore-combos')>();
  return { ...actual, firestorePublishDeps: () => ({}) };
});
import { resetRateLimitState } from '../../../../lib/rate-limit';

const validBody = {
  name: 'Triple 9 Combo', slug: 'triple-9', description: 'Ten frames', coverImageUrl: '/c.jpg', price: 99900, mrp: 199900,
  items: [{ id: 'small', productId: 'p1', variantId: 'v1', quantity: 2 }],
};
const stored = {
  id: 'combo_1', slug: 'triple-9', name: 'Triple 9 Combo', description: '', status: 'draft', coverImageUrl: '/c.jpg', price: 99900, mrp: 199900,
  items: [{ id: 'small', productId: 'p1', variantId: 'v1', quantity: 2 }], version: 3, couponsAllowed: false, sortOrder: 0,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
};

const req = (method: string, body?: unknown) =>
  new Request('https://example.com/api/admin/combos', { method, headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, ...(body !== undefined && { body: JSON.stringify(body) }) });
const ctx = { params: Promise.resolve({ id: 'combo_1' }) };

describe('admin combos API', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({ ok: true, uid: 'admin_1' });
    mockSlugQuery.mockResolvedValue({ empty: true, docs: [] });
    mockDocGet.mockResolvedValue({ exists: true, id: 'combo_1', data: () => stored });
    mockCheckPublishable.mockResolvedValue([]);
  });

  it('refuses callers without catalogue access', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    expect((await POST(req('POST', validBody))).status).toBe(403);
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    expect((await GET(req('GET'))).status).toBe(401);
  });

  it('creates a combo as a version-1 draft whatever the client asks for, and audits it', async () => {
    const response = await POST(req('POST', { ...validBody, status: 'draft' }));
    expect(response.status).toBe(201);
    const { combo } = await response.json();
    expect(combo).toMatchObject({ id: 'combo_new', status: 'draft', version: 1, price: 99900, mrp: 199900, couponsAllowed: false });
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'combo_new', status: 'draft', version: 1 }));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'combo.create', resource: 'combo' }));
  });

  it('refuses to publish on create, an MRP below the price, and duplicate item ids', async () => {
    expect((await POST(req('POST', { ...validBody, status: 'published' }))).status).toBe(400);
    expect((await POST(req('POST', { ...validBody, mrp: 50000 }))).status).toBe(400);
    expect((await POST(req('POST', { ...validBody, items: [validBody.items[0], validBody.items[0]] }))).status).toBe(400);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('refuses a web address another combo already uses', async () => {
    mockSlugQuery.mockResolvedValueOnce({ empty: false, docs: [{ id: 'other' }] });
    expect((await POST(req('POST', validBody))).status).toBe(409);
  });

  it('bumps the version when the price or contents change, but not for a name change', async () => {
    let response = await PATCH(req('PATCH', { price: 89900 }), ctx);
    expect(response.status).toBe(200);
    expect((await response.json()).combo.version).toBe(4);

    response = await PATCH(req('PATCH', { name: 'Triple 9 Deluxe' }), ctx);
    expect((await response.json()).combo.version).toBe(3);
  });

  it('will not publish a combo that can\'t be bought, and says why', async () => {
    mockCheckPublishable.mockResolvedValueOnce([{ itemId: 'small', message: 'Small frame is out of stock.' }]);
    const response = await PATCH(req('PATCH', { status: 'published' }), ctx);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('not_publishable');
    expect(body.error.details.problems).toEqual([{ itemId: 'small', message: 'Small frame is out of stock.' }]);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('publishes a ready combo and audits the change', async () => {
    const response = await PATCH(req('PATCH', { status: 'published' }), ctx);
    expect(response.status).toBe(200);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'combo.published' }));
  });

  it('deleting archives instead, so carts and orders that mention the combo keep working', async () => {
    const response = await DELETE(req('DELETE'), ctx);
    expect(response.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived', id: 'combo_1' }));
  });

  it('404s for an unknown combo', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false });
    expect((await PATCH(req('PATCH', { name: 'x' }), ctx)).status).toBe(404);
  });
});

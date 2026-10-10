import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('../../../../../lib/catalogue/guard', () => ({
  catalogueGuard: async () => ({
    ok: true,
    uid: 'admin_1',
    db: {
      collection: () => ({
        doc: (id: string) => ({ get: async () => ({ exists: store.has(id), data: () => store.get(id) }), set: async (v: Record<string, unknown>) => void store.set(id, v) }),
        where: () => ({ get: async () => ({ docs: [] }) }),
      }),
    },
  }),
}));
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

import { PATCH } from './route';

const model = {
  id: 'normal-frame-1-inch', name: 'Normal Frame 1 inch', code: 'NF-1', colour: 'Brown', colourHex: '#5a3825', material: 'Acrylic', mouldingWidthIn: 1, image: null,
  costPerFoot: 10000, priceDelta: 0, isActive: true, sortOrder: 1000, createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z',
};
const patch = (body: unknown) => PATCH(new Request('http://x/api/admin/frame-models/normal-frame-1-inch', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'normal-frame-1-inch' }) });

describe('PATCH /api/admin/frame-models/[id]', () => {
  beforeEach(() => store.set('normal-frame-1-inch', { ...model }));

  it('saves an edit even when the whole saved model (with id and dates) is sent back', async () => {
    const res = await patch({ ...model, material: 'Other' });
    expect(res.status).toBe(200);
    const saved = store.get('normal-frame-1-inch')!;
    expect(saved).toMatchObject({ id: 'normal-frame-1-inch', material: 'Other', createdAt: model.createdAt });
    expect(saved.updatedAt).not.toBe(model.updatedAt);
  });

  it('still refuses fields that are not part of a frame model', async () => {
    expect((await patch({ material: 'Other', makingSecret: 1 })).status).toBe(400);
  });
});

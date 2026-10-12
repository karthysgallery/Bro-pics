import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('../../../../lib/catalogue/guard', () => ({
  catalogueGuard: async () => ({
    ok: true,
    uid: 'admin_1',
    db: {
      collection: () => ({
        get: async () => ({ docs: [...store.entries()].map(([id, v]) => ({ id, get: (f: string) => v[f], data: () => v })) }),
        doc: (id: string) => ({
          get: async () => ({ exists: store.has(id), data: () => store.get(id), get: (f: string) => store.get(id)?.[f] }),
          set: async (v: Record<string, unknown>) => void store.set(id, v),
          delete: async () => void store.delete(id),
        }),
      }),
    },
  }),
}));
vi.mock('../../../../lib/audit-log', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

import { GET, POST } from './route';
import { PUT, DELETE } from './[id]/route';

const line = (over: Record<string, unknown> = {}) => ({ longIn: 12, shortIn: 8, frameModelId: 'teak', mrp: 99900, price: 79900, isActive: true, ...over });
const post = (body: unknown) => POST(new Request('http://x/api/admin/price-lists', { method: 'POST', body: JSON.stringify(body) }));
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('price lists API', () => {
  beforeEach(() => store.clear());

  it('creates a list with a readable id, lists it back, and refuses the same name twice', async () => {
    const res = await post({ name: 'Devotional frames', rows: [line()] });
    expect(res.status).toBe(201);
    expect((await res.json()).priceList.id).toBe('devotional-frames');
    expect(((await (await GET(new Request('http://x'))).json()).priceLists as unknown[]).length).toBe(1);
    expect((await post({ name: 'devotional FRAMES', rows: [line()] })).status).toBe(409);
  });

  it('refuses a bad list with the first problem in plain words', async () => {
    const res = await post({ name: 'Bad', rows: [line({ price: 200000 })] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain('Selling price cannot be more than the MRP');
  });

  it('updates (accepting the saved id and dates back), keeps the created date, and deletes', async () => {
    const created = (await (await post({ name: 'Film stars', rows: [line()] })).json()).priceList;
    const res = await PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify({ ...created, name: 'Film star frames', rows: [line({ price: 70000 })] }) }), ctx('film-stars'));
    expect(res.status).toBe(200);
    const saved = store.get('film-stars')!;
    expect(saved).toMatchObject({ name: 'Film star frames', createdAt: created.createdAt });
    expect((saved.rows as Array<{ price: number }>)[0]!.price).toBe(70000);
    expect((await DELETE(new Request('http://x', { method: 'DELETE' }), ctx('film-stars'))).status).toBe(200);
    expect(store.has('film-stars')).toBe(false);
    expect((await PUT(new Request('http://x', { method: 'PUT', body: '{}' }), ctx('film-stars'))).status).toBe(404);
  });
});

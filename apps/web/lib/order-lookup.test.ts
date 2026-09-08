import { describe, it, expect, vi } from 'vitest';
import { findOrderByOrderNo, findOrdersByStatus } from './order-lookup';

function makeFakeDb(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({
            empty: docs.length === 0,
            docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
          }),
        })),
      })),
    })),
  };
}

function makeFakeQueryDb(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  const orderBy = vi.fn(() => ({
    get: vi.fn().mockResolvedValue({
      docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
    }),
  }));
  const where = vi.fn(() => ({ orderBy }));
  const db = {
    collection: vi.fn(() => ({ where })),
  };
  return { db, where, orderBy };
}

describe('findOrderByOrderNo', () => {
  it('returns the matching order with its id when found', async () => {
    const db = makeFakeDb([{ id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'paid' } }]);
    const result = await findOrderByOrderNo(db as never, 'BP-2026-00001');
    expect(result).toEqual({ id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'paid' } });
  });

  it('returns null when no order matches', async () => {
    const db = makeFakeDb([]);
    const result = await findOrderByOrderNo(db as never, 'BP-2026-99999');
    expect(result).toBeNull();
  });
});

describe('findOrdersByStatus', () => {
  it('returns every order matching the given status, in query order', async () => {
    const { db, where, orderBy } = makeFakeQueryDb([
      { id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'paid', placedAt: '2026-09-01T00:00:00.000Z' } },
      { id: 'order_2', data: { orderNo: 'BP-2026-00002', status: 'paid', placedAt: '2026-09-02T00:00:00.000Z' } },
    ]);
    const result = await findOrdersByStatus(db as never, 'paid');
    expect(result).toEqual([
      { id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'paid', placedAt: '2026-09-01T00:00:00.000Z' } },
      { id: 'order_2', data: { orderNo: 'BP-2026-00002', status: 'paid', placedAt: '2026-09-02T00:00:00.000Z' } },
    ]);
    // This query must exactly match the deployed Firestore composite index
    // (status ASC, placedAt ASC) or it fails against the live project.
    expect(where).toHaveBeenCalledWith('status', '==', 'paid');
    expect(orderBy).toHaveBeenCalledWith('placedAt', 'asc');
  });

  it('returns an empty array when no orders match', async () => {
    const { db, where, orderBy } = makeFakeQueryDb([]);
    const result = await findOrdersByStatus(db as never, 'delivered');
    expect(result).toEqual([]);
    expect(where).toHaveBeenCalledWith('status', '==', 'delivered');
    expect(orderBy).toHaveBeenCalledWith('placedAt', 'asc');
  });
});

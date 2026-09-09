import { describe, it, expect, vi } from 'vitest';
import { findOrderByOrderNo, findOrdersByStatus, findVerifiedPurchase } from './order-lookup';

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

function makeFakeVerifiedPurchaseDb(
  orders: Array<{ id: string; data: Record<string, unknown> }>,
  itemsByOrderId: Record<string, Array<{ id: string; data: Record<string, unknown> }>>
) {
  const ordersWhere = vi.fn(() => ({
    get: vi.fn().mockResolvedValue({
      docs: orders.map((o) => ({ id: o.id, data: () => o.data })),
    }),
  }));
  const db = {
    collection: vi.fn((name: string) => {
      if (name === 'orders') {
        return { where: ordersWhere };
      }
      throw new Error(`unexpected top-level collection: ${name}`);
    }),
    doc: vi.fn(),
  };
  // orders/{orderId}/items is reached via db.collection('orders').doc(id).collection('items')
  const docFn = vi.fn((orderId: string) => ({
    collection: vi.fn((name: string) => {
      if (name !== 'items') throw new Error(`unexpected subcollection: ${name}`);
      return {
        where: vi.fn((_field: string, _op: string, productIdValue: string) => ({
          limit: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({
              get empty() {
                const allItems = itemsByOrderId[orderId] ?? [];
                const filtered = allItems.filter((item) => item.data.productId === productIdValue);
                return filtered.length === 0;
              },
              get docs() {
                const allItems = itemsByOrderId[orderId] ?? [];
                const filtered = allItems.filter((item) => item.data.productId === productIdValue);
                return filtered.map((d) => ({ id: d.id, data: () => d.data }));
              },
            }),
          })),
        })),
      };
    }),
  }));
  ordersWhere.mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ docs: orders.map((o) => ({ id: o.id, data: () => o.data })) }),
  }));
  (db.collection as unknown as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    if (name === 'orders') return { where: ordersWhere, doc: docFn };
    throw new Error(`unexpected top-level collection: ${name}`);
  });
  return db;
}

describe('findVerifiedPurchase', () => {
  it('returns the orderId when an order for that user contains the product', async () => {
    const db = makeFakeVerifiedPurchaseDb(
      [{ id: 'order_1', data: { userId: 'user_1' } }],
      { order_1: [{ id: 'item_1', data: { productId: 'prod_1' } }] }
    );
    const result = await findVerifiedPurchase(db as never, 'user_1', 'prod_1');
    expect(result).toEqual({ orderId: 'order_1' });
  });

  it('returns null when the user has an order but not for that product', async () => {
    const db = makeFakeVerifiedPurchaseDb(
      [{ id: 'order_1', data: { userId: 'user_1' } }],
      { order_1: [{ id: 'item_1', data: { productId: 'some_other_product' } }] }
    );
    const result = await findVerifiedPurchase(db as never, 'user_1', 'prod_1');
    expect(result).toBeNull();
  });

  it('returns null when the user has no orders at all', async () => {
    const db = makeFakeVerifiedPurchaseDb([], {});
    const result = await findVerifiedPurchase(db as never, 'user_1', 'prod_1');
    expect(result).toBeNull();
  });
});

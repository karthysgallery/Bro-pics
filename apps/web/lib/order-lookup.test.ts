import { describe, it, expect, vi } from 'vitest';
import { findOrderByOrderNo } from './order-lookup';

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

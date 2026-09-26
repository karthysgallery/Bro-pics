import { describe, it, expect } from 'vitest';
import { findStuckPendingOrders, type OrderForReconciliation } from './stuck-orders';

const NOW = new Date('2026-09-24T12:00:00.000Z');

function order(overrides: Partial<OrderForReconciliation> = {}): OrderForReconciliation {
  return { id: 'order_1', status: 'pending_payment', placedAt: new Date('2026-09-24T11:00:00.000Z'), ...overrides };
}

describe('findStuckPendingOrders', () => {
  it('flags a pending_payment order placed more than the threshold ago', () => {
    const result = findStuckPendingOrders([order()], NOW, 15);
    expect(result.map((o) => o.id)).toEqual(['order_1']);
  });

  it('does not flag a pending_payment order placed within the threshold', () => {
    const recent = order({ placedAt: new Date(NOW.getTime() - 5 * 60_000) });
    expect(findStuckPendingOrders([recent], NOW, 15)).toEqual([]);
  });

  it('does not flag an order at exactly the threshold boundary', () => {
    const atThreshold = order({ placedAt: new Date(NOW.getTime() - 15 * 60_000) });
    expect(findStuckPendingOrders([atThreshold], NOW, 15)).toEqual([]);
  });

  it('never flags an order that has moved past pending_payment', () => {
    const paid = order({ status: 'paid' });
    expect(findStuckPendingOrders([paid], NOW, 15)).toEqual([]);
  });

  it('defaults the threshold to 15 minutes when not given', () => {
    const stuck = order({ placedAt: new Date(NOW.getTime() - 20 * 60_000) });
    const fine = order({ id: 'order_2', placedAt: new Date(NOW.getTime() - 10 * 60_000) });
    expect(findStuckPendingOrders([stuck, fine], NOW).map((o) => o.id)).toEqual(['order_1']);
  });
});

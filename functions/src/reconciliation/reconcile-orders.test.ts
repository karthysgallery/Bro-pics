import { describe, it, expect, vi } from 'vitest';
import { runOrderReconciliation, type ReconciliationDeps } from './reconcile-orders';

const NOW = new Date('2026-09-24T12:00:00.000Z');

describe('runOrderReconciliation', () => {
  it('reports stuck pending orders and writes them to the reconciliation report', async () => {
    const deps: ReconciliationDeps = {
      fetchPendingOrders: vi.fn().mockResolvedValue([
        { id: 'order_1', status: 'pending_payment', placedAt: new Date('2026-09-24T11:00:00.000Z') }, // stuck
        { id: 'order_2', status: 'pending_payment', placedAt: new Date('2026-09-24T11:58:00.000Z') }, // recent, fine
      ]),
      writeReconciliationReport: vi.fn().mockResolvedValue(undefined),
    };

    const result = await runOrderReconciliation(deps, NOW);

    expect(result.stuckOrderIds).toEqual(['order_1']);
    expect(deps.writeReconciliationReport).toHaveBeenCalledWith(['order_1'], NOW);
  });

  it('still writes a report (with an empty list) when nothing is stuck', async () => {
    const deps: ReconciliationDeps = {
      fetchPendingOrders: vi.fn().mockResolvedValue([]),
      writeReconciliationReport: vi.fn().mockResolvedValue(undefined),
    };

    const result = await runOrderReconciliation(deps, NOW);

    expect(result.stuckOrderIds).toEqual([]);
    expect(deps.writeReconciliationReport).toHaveBeenCalledWith([], NOW);
  });
});

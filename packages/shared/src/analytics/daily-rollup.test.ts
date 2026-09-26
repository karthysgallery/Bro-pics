import { describe, it, expect } from 'vitest';
import { computeDailyRollup, type OrderWithItemsForRollup } from './daily-rollup';

describe('computeDailyRollup (ANL-05)', () => {
  it('correctly computes daily aggregates and reconciles order IDs', () => {
    const orders: OrderWithItemsForRollup[] = [
      {
        id: 'ord_1',
        status: 'delivered',
        paymentStatus: 'paid',
        paymentMode: 'prepaid',
        total: 2000,
        discount: 200,
        shipping: 0,
        taxLines: [{ rate: 0.18, amount: 305 }],
        userId: 'user_1',
        items: [
          { productId: 'prod_frame_1', title: 'Frame 1', quantity: 2, price: 1000 },
        ],
      },
      {
        id: 'ord_2',
        status: 'in_production',
        paymentStatus: 'paid',
        paymentMode: 'partial_cod',
        total: 1500,
        discount: 0,
        shipping: 100,
        taxLines: [{ rate: 0.18, amount: 228 }],
        userId: 'user_2',
        items: [
          { productId: 'prod_frame_1', title: 'Frame 1', quantity: 1, price: 1000 },
          { productId: 'prod_frame_2', title: 'Frame 2', quantity: 1, price: 500 },
        ],
      },
      {
        id: 'ord_cancelled',
        status: 'cancelled',
        paymentStatus: 'pending',
        paymentMode: 'prepaid',
        total: 1000,
        discount: 0,
        shipping: 0,
        taxLines: [],
        userId: 'user_3',
      },
    ];

    const refunds = [
      { id: 'ref_1', status: 'processed' as const, amount: 300 },
    ];

    const pastCustomers = new Set(['user_1']); // user_1 is repeat, user_2 is new

    const result = computeDailyRollup('2026-09-25', orders, refunds, pastCustomers);

    expect(result.id).toBe('2026-09-25');
    expect(result.date).toBe('2026-09-25');

    // Orders counts
    expect(result.orders.total).toBe(3);
    expect(result.orders.paid).toBe(2);
    expect(result.orders.cancelled).toBe(1);

    // Revenue calculations
    expect(result.revenue.gross).toBe(3500);
    expect(result.revenue.discounts).toBe(200);
    expect(result.revenue.shipping).toBe(100);
    expect(result.revenue.tax).toBe(533);
    expect(result.revenue.refunds).toBe(300);
    expect(result.revenue.net).toBe(3200);
    expect(result.revenue.aov).toBe(1600);

    // Payment modes
    expect(result.paymentModes.prepaid).toBe(1);
    expect(result.paymentModes.partialCod).toBe(1);

    // Products breakdown
    expect(result.products.unitsSold).toBe(4);
    expect(result.products.byProduct['prod_frame_1']).toEqual({
      title: 'Frame 1',
      units: 3,
      revenue: 3000,
    });
    expect(result.products.byProduct['prod_frame_2']).toEqual({
      title: 'Frame 2',
      units: 1,
      revenue: 500,
    });

    // Customers breakdown
    expect(result.customers.uniqueCustomers).toBe(2);
    expect(result.customers.newCustomers).toBe(1);
    expect(result.customers.repeatCustomers).toBe(1);

    // Exact reconciliation
    expect(result.reconciledOrderIds).toEqual(['ord_1', 'ord_2', 'ord_cancelled']);
  });

  it('is strictly idempotent on re-execution', () => {
    const orders: OrderWithItemsForRollup[] = [
      {
        id: 'ord_1',
        status: 'delivered',
        paymentStatus: 'paid',
        paymentMode: 'prepaid',
        total: 1000,
        discount: 0,
        shipping: 0,
        taxLines: [],
        userId: 'user_1',
      },
    ];

    const timestamp = new Date('2026-09-26T00:05:00.000Z');
    const run1 = computeDailyRollup('2026-09-25', orders, [], new Set(), timestamp);
    const run2 = computeDailyRollup('2026-09-25', orders, [], new Set(), timestamp);

    expect(run1).toEqual(run2);
  });
});

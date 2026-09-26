import { describe, it, expect } from 'vitest';
import { AnalyticsDailySchema } from './analytics-daily';

describe('AnalyticsDailySchema (ANL-05)', () => {
  it('validates a complete daily rollup document', () => {
    const validRollup = {
      id: '2026-09-25',
      date: '2026-09-25',
      orders: {
        total: 10,
        paid: 8,
        cancelled: 1,
        pending: 1,
        refunded: 0,
      },
      revenue: {
        gross: 24000,
        discounts: 2400,
        shipping: 500,
        tax: 2800,
        refunds: 0,
        net: 24000,
        aov: 3000,
      },
      paymentModes: {
        prepaid: 6,
        partialCod: 2,
      },
      products: {
        unitsSold: 12,
        byProduct: {
          prod_frame_1: {
            title: 'Classic Walnut Frame',
            units: 8,
            revenue: 16000,
          },
          prod_frame_2: {
            title: 'Gold Edge Minimalist Frame',
            units: 4,
            revenue: 8000,
          },
        },
      },
      customers: {
        totalOrders: 8,
        uniqueCustomers: 7,
        newCustomers: 5,
        repeatCustomers: 2,
      },
      reconciledOrderIds: ['ord_1', 'ord_2', 'ord_3'],
      reconciledAt: new Date(),
      version: 1,
    };

    const parsed = AnalyticsDailySchema.parse(validRollup);
    expect(parsed.id).toBe('2026-09-25');
    expect(parsed.orders.paid).toBe(8);
    expect(parsed.revenue.gross).toBe(24000);
    expect(parsed.reconciledOrderIds).toHaveLength(3);
  });

  it('rejects negative counts or revenue', () => {
    const invalid = {
      id: '2026-09-25',
      date: '2026-09-25',
      orders: { total: -1, paid: 0, cancelled: 0, pending: 0, refunded: 0 },
      revenue: { gross: 0, discounts: 0, shipping: 0, tax: 0, refunds: 0, net: 0, aov: 0 },
      paymentModes: { prepaid: 0, partialCod: 0 },
      products: { unitsSold: 0, byProduct: {} },
      customers: { totalOrders: 0, uniqueCustomers: 0, newCustomers: 0, repeatCustomers: 0 },
      reconciledOrderIds: [],
      reconciledAt: new Date(),
    };

    expect(() => AnalyticsDailySchema.parse(invalid)).toThrow();
  });
});

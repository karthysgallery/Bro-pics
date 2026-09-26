import { describe, it, expect } from 'vitest';
import {
  computeSalesAnalytics,
  computeProductsAnalytics,
  computeCustomersAnalytics,
  computeMarketingAnalytics,
  computePersonalizationAnalytics,
  computeFunnelAnalytics,
  computeOperationsAnalytics,
} from './reports';

describe('analytics reports (ANL-06/07)', () => {
  describe('computeSalesAnalytics', () => {
    it('aggregates sales and computes daily trend', () => {
      const orders = [
        {
          id: 'o1',
          status: 'delivered' as const,
          paymentStatus: 'paid' as const,
          paymentMode: 'prepaid' as const,
          total: 2000,
          discount: 200,
          shipping: 100,
          taxLines: [{ rate: 0.18, amount: 300 }],
          placedAt: new Date('2026-09-25T10:00:00Z'),
        },
        {
          id: 'o2',
          status: 'in_production' as const,
          paymentStatus: 'paid' as const,
          paymentMode: 'partial_cod' as const,
          total: 1000,
          discount: 0,
          shipping: 0,
          taxLines: [{ rate: 0.18, amount: 150 }],
          placedAt: new Date('2026-09-25T12:00:00Z'),
        },
        {
          id: 'o3',
          status: 'cancelled' as const,
          paymentStatus: 'failed' as const,
          paymentMode: 'prepaid' as const,
          total: 1500,
          discount: 0,
          shipping: 0,
          taxLines: [],
          placedAt: new Date('2026-09-25T14:00:00Z'),
        },
      ];
      const refunds = [
        {
          id: 'r1',
          status: 'processed' as const,
          amount: 500,
          processedAt: new Date('2026-09-25T16:00:00Z'),
          createdAt: new Date('2026-09-25T16:00:00Z'),
        },
      ];

      const res = computeSalesAnalytics(orders, refunds);
      expect(res.grossRevenue).toBe(3000);
      expect(res.netRevenue).toBe(2500);
      expect(res.totalDiscounts).toBe(200);
      expect(res.totalShipping).toBe(100);
      expect(res.totalTax).toBe(450);
      expect(res.totalRefunds).toBe(500);
      expect(res.orderCount).toBe(3);
      expect(res.paidOrderCount).toBe(2);
      expect(res.cancelledOrderCount).toBe(1);
      expect(res.aov).toBe(1250);
      expect(res.paymentModes.prepaid.count).toBe(1);
      expect(res.paymentModes.partialCod.count).toBe(1);
      expect(res.dailyTrend).toHaveLength(1);
      expect(res.dailyTrend[0].date).toBe('2026-09-25');
      expect(res.dailyTrend[0].net).toBe(2500);
    });
  });

  describe('computeProductsAnalytics', () => {
    it('ranks top products by revenue and units', () => {
      const orders = [
        {
          id: 'o1',
          status: 'delivered' as const,
          paymentStatus: 'paid' as const,
          paymentMode: 'prepaid' as const,
          total: 2000,
          discount: 0,
          shipping: 0,
          taxLines: [],
          userId: 'u1',
          items: [
            { productId: 'p1', title: 'Frame 1', quantity: 2, price: 500 },
            { productId: 'p2', title: 'Frame 2', quantity: 1, price: 1000 },
          ],
        },
      ];
      const res = computeProductsAnalytics(orders);
      expect(res.totalUnitsSold).toBe(3);
      expect(res.totalProductsWithSales).toBe(2);
      expect(res.topProducts[0].revenue).toBe(1000);
    });
  });

  describe('computeCustomersAnalytics', () => {
    it('computes new vs repeat and frequency distribution', () => {
      const orders = [
        { userId: 'u1', paymentStatus: 'paid' as const, total: 1000 },
        { userId: 'u1', paymentStatus: 'paid' as const, total: 1000 },
        { userId: 'u2', paymentStatus: 'paid' as const, total: 1500 },
      ];
      const res = computeCustomersAnalytics(orders, new Set());
      expect(res.uniqueCustomers).toBe(2);
      expect(res.newCustomers).toBe(1); // u2
      expect(res.repeatCustomers).toBe(1); // u1
      expect(res.frequencyDistribution.twoOrders).toBe(1);
      expect(res.frequencyDistribution.singleOrder).toBe(1);
      expect(res.topCustomers[0].userId).toBe('u1');
      expect(res.topCustomers[0].totalSpent).toBe(2000);
    });
  });

  describe('computeMarketingAnalytics', () => {
    it('aggregates coupon discount and attribution', () => {
      const orders = [
        { couponId: 'SAVE10', discount: 100, total: 900, paymentStatus: 'paid' as const },
        { couponId: 'SAVE10', discount: 100, total: 900, paymentStatus: 'paid' as const },
        { couponId: undefined, discount: 0, total: 1000, paymentStatus: 'paid' as const },
      ];
      const res = computeMarketingAnalytics(orders);
      expect(res.totalOrdersWithCoupon).toBe(2);
      expect(res.totalCouponDiscount).toBe(200);
      expect(res.coupons[0].code).toBe('SAVE10');
      expect(res.coupons[0].attributedRevenue).toBe(1800);
    });
  });

  describe('computePersonalizationAnalytics', () => {
    it('calculates text, clipart, and DPI distribution', () => {
      const customizations = [
        {
          textFieldsJson: { name: { value: 'John', fontFamily: 'Inter', color: '#000' } },
          clipartId: 'heart',
          dpiBand: 'green' as const,
        },
        {
          textFieldsJson: undefined,
          clipartId: undefined,
          dpiBand: 'red' as const,
        },
      ];
      const res = computePersonalizationAnalytics(customizations);
      expect(res.totalCustomizations).toBe(2);
      expect(res.textPersonalizationCount).toBe(1);
      expect(res.clipartUsageCount).toBe(1);
      expect(res.dpiDistribution.green).toBe(1);
      expect(res.dpiDistribution.red).toBe(1);
      expect(res.dpiDistribution.amber).toBe(0);
    });
  });

  describe('computeFunnelAnalytics', () => {
    it('calculates conversion and cancellation rates', () => {
      const now = new Date('2026-09-26T12:00:00Z');
      const orders = [
        { status: 'delivered' as const, paymentStatus: 'paid' as const, placedAt: now },
        { status: 'cancelled' as const, paymentStatus: 'failed' as const, placedAt: now },
        {
          status: 'pending_payment' as const,
          paymentStatus: 'pending' as const,
          placedAt: new Date(now.getTime() - 40 * 60 * 1000), // > 30 min
        },
      ];
      const res = computeFunnelAnalytics(orders, now);
      expect(res.ordersInitiated).toBe(3);
      expect(res.ordersPaid).toBe(1);
      expect(res.ordersCancelled).toBe(1);
      expect(res.ordersStuckPending).toBe(1);
      expect(res.conversionRate).toBe(0.33);
      expect(res.cancellationRate).toBe(0.33);
      expect(res.dropoffRate).toBe(0.33);
    });
  });

  describe('computeOperationsAnalytics', () => {
    it('computes returns, QC pass rate, and print job stats', () => {
      const orders = [
        { status: 'packed' as const, paymentStatus: 'paid' as const },
        { status: 'rework' as const, paymentStatus: 'paid' as const },
      ];
      const returns = [
        { status: 'refunded' as const, reasonCategory: 'damaged' as const },
      ];
      const printJobs = [
        { status: 'done' as const },
        { status: 'failed' as const },
      ];

      const res = computeOperationsAnalytics(orders, returns, printJobs);
      expect(res.ordersTotal).toBe(2);
      expect(res.returnsCount).toBe(1);
      expect(res.returnsRate).toBe(0.5);
      expect(res.reasonsBreakdown['damaged']).toBe(1);
      expect(res.printJobs.done).toBe(1);
      expect(res.printJobs.failed).toBe(1);
      expect(res.printJobs.successRate).toBe(0.5);
      expect(res.qcMetrics.packedCount).toBe(1);
      expect(res.qcMetrics.reworkCount).toBe(1);
      expect(res.qcMetrics.passRate).toBe(0.5);
    });
  });
});

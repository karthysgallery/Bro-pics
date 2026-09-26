import { describe, it, expect } from 'vitest';
import {
  getIstDayRange,
  computeTodayRevenue,
  computeProductionStatusCounts,
  buildOperationalAlerts,
  IST_OFFSET_MS,
} from './dashboard';

describe('dashboard helpers (ANL-02)', () => {
  describe('getIstDayRange', () => {
    it('correctly calculates IST start and end for afternoon in UTC', () => {
      // 2026-09-26 04:00:00 UTC = 2026-09-26 09:30:00 IST
      const now = new Date('2026-09-26T04:00:00.000Z');
      const range = getIstDayRange(now);

      expect(range.dateStr).toBe('2026-09-26');
      // 2026-09-26 00:00:00 IST = 2026-09-25 18:30:00 UTC
      expect(range.start.toISOString()).toBe('2026-09-25T18:30:00.000Z');
      // 2026-09-26 23:59:59.999 IST = 2026-09-26 18:29:59.999 UTC
      expect(range.end.toISOString()).toBe('2026-09-26T18:29:59.999Z');
    });

    it('correctly handles evening in UTC which rolls to the next day in IST', () => {
      // 2026-09-25 19:00:00 UTC + 5h30 = 2026-09-26 00:30:00 IST
      const now = new Date('2026-09-25T19:00:00.000Z');
      const range = getIstDayRange(now);

      expect(range.dateStr).toBe('2026-09-26');
      expect(range.start.toISOString()).toBe('2026-09-25T18:30:00.000Z');
      expect(range.end.toISOString()).toBe('2026-09-26T18:29:59.999Z');
    });

    it('identifies previous day if before 18:30 UTC', () => {
      // 2026-09-25 18:00:00 UTC + 5h30 = 2026-09-25 23:30:00 IST
      const now = new Date('2026-09-25T18:00:00.000Z');
      const range = getIstDayRange(now);

      expect(range.dateStr).toBe('2026-09-25');
      expect(range.start.toISOString()).toBe('2026-09-24T18:30:00.000Z');
      expect(range.end.toISOString()).toBe('2026-09-25T18:29:59.999Z');
    });
  });

  describe('computeTodayRevenue', () => {
    it('computes gross, refunds, net and AOV accurately', () => {
      const orders = [
        { id: 'o1', paymentStatus: 'paid' as const, total: 1000 },
        { id: 'o2', paymentStatus: 'paid' as const, total: 2000 },
        { id: 'o3', paymentStatus: 'pending' as const, total: 1500 }, // excluded
        { id: 'o4', paymentStatus: 'failed' as const, total: 500 }, // excluded
      ];
      const refunds = [
        { id: 'r1', status: 'processed' as const, amount: 400 },
        { id: 'r2', status: 'pending' as const, amount: 200 }, // pending not yet deducted from settled revenue
      ];

      const res = computeTodayRevenue(orders, refunds, '2026-09-26');

      expect(res.date).toBe('2026-09-26');
      expect(res.orderCount).toBe(2);
      expect(res.grossRevenue).toBe(3000);
      expect(res.refundsTotal).toBe(400);
      expect(res.netRevenue).toBe(2600);
      expect(res.aov).toBe(1300);
    });

    it('handles zero orders safely', () => {
      const res = computeTodayRevenue([], [], '2026-09-26');
      expect(res.orderCount).toBe(0);
      expect(res.grossRevenue).toBe(0);
      expect(res.refundsTotal).toBe(0);
      expect(res.netRevenue).toBe(0);
      expect(res.aov).toBe(0);
    });
  });

  describe('computeProductionStatusCounts', () => {
    it('counts orders per status accurately', () => {
      const orders = [
        { status: 'in_production' as const },
        { status: 'in_production' as const },
        { status: 'quality_check' as const },
        { status: 'shipped' as const },
      ];

      const counts = computeProductionStatusCounts(orders);

      expect(counts.in_production).toBe(2);
      expect(counts.quality_check).toBe(1);
      expect(counts.shipped).toBe(1);
      expect(counts.delivered).toBe(0);
      expect(counts.packed).toBe(0);
      expect(counts.rework).toBe(0);
    });
  });

  describe('buildOperationalAlerts', () => {
    it('generates alerts matching the given counts and severities', () => {
      const alerts = buildOperationalAlerts({
        failedRenders: 2,
        stuckPendingOrders: 3,
        photoValidationOrders: 1,
        reworkOrders: 0,
        failedRefunds: 1,
        pendingRefunds: 4,
        openReturns: 2,
        pendingReviews: 5,
      });

      expect(alerts).toHaveLength(7);
      expect(alerts.find((a) => a.id === 'failed_renders')?.severity).toBe('critical');
      expect(alerts.find((a) => a.id === 'failed_refunds')?.severity).toBe('critical');
      expect(alerts.find((a) => a.id === 'stuck_pending')?.severity).toBe('warning');
      expect(alerts.find((a) => a.id === 'photo_validation')?.severity).toBe('warning');
      expect(alerts.find((a) => a.id === 'open_returns')?.severity).toBe('warning');
      expect(alerts.find((a) => a.id === 'pending_refunds')?.severity).toBe('info');
      expect(alerts.find((a) => a.id === 'pending_reviews')?.severity).toBe('info');
    });

    it('returns empty array when all operational counts are 0', () => {
      const alerts = buildOperationalAlerts({
        failedRenders: 0,
        stuckPendingOrders: 0,
        photoValidationOrders: 0,
        reworkOrders: 0,
        failedRefunds: 0,
        pendingRefunds: 0,
        openReturns: 0,
        pendingReviews: 0,
      });

      expect(alerts).toEqual([]);
    });
  });
});

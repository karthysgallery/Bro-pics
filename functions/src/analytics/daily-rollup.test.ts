import { describe, it, expect, vi } from 'vitest';
import {
  parseIstDayRange,
  executeDailyRollup,
  backfillDailyRollups,
  type DailyRollupDeps,
} from './daily-rollup';
import { type AnalyticsDaily } from '@bro-pics/shared';

describe('daily-rollup functions service (ANL-05)', () => {
  it('parseIstDayRange parses YYYY-MM-DD into accurate UTC bounds', () => {
    const { start, end } = parseIstDayRange('2026-09-25');
    // 2026-09-25 00:00:00 IST = 2026-09-24 18:30:00 UTC
    expect(start.toISOString()).toBe('2026-09-24T18:30:00.000Z');
    // 2026-09-25 23:59:59.999 IST = 2026-09-25 18:29:59.999 UTC
    expect(end.toISOString()).toBe('2026-09-25T18:29:59.999Z');
  });

  it('executeDailyRollup calls deps and writes rollup document', async () => {
    const writtenDocs: Record<string, AnalyticsDaily> = {};

    const mockDeps: DailyRollupDeps = {
      fetchOrdersForDay: vi.fn().mockResolvedValue([
        {
          id: 'ord_1',
          status: 'delivered',
          paymentStatus: 'paid',
          paymentMode: 'prepaid',
          total: 1500,
          discount: 0,
          shipping: 0,
          taxLines: [],
          userId: 'user_1',
          items: [{ productId: 'p1', title: 'Frame', quantity: 1, price: 1500 }],
        },
      ]),
      fetchRefundsForDay: vi.fn().mockResolvedValue([]),
      fetchPastCustomerIds: vi.fn().mockResolvedValue(new Set()),
      writeDailyRollup: vi.fn(async (dateStr, rollup) => {
        writtenDocs[dateStr] = rollup;
      }),
    };

    const rollup = await executeDailyRollup(mockDeps, '2026-09-25');

    expect(rollup.id).toBe('2026-09-25');
    expect(rollup.orders.paid).toBe(1);
    expect(rollup.revenue.gross).toBe(1500);
    expect(mockDeps.writeDailyRollup).toHaveBeenCalledWith('2026-09-25', rollup);
    expect(writtenDocs['2026-09-25']).toEqual(rollup);
  });

  it('backfillDailyRollups iterates through date range and generates rollups for each date', async () => {
    const writtenDates: string[] = [];

    const mockDeps: DailyRollupDeps = {
      fetchOrdersForDay: vi.fn().mockResolvedValue([]),
      fetchRefundsForDay: vi.fn().mockResolvedValue([]),
      fetchPastCustomerIds: vi.fn().mockResolvedValue(new Set()),
      writeDailyRollup: vi.fn(async (dateStr) => {
        writtenDates.push(dateStr);
      }),
    };

    const result = await backfillDailyRollups(mockDeps, '2026-09-23', '2026-09-25');

    expect(result.processedDays).toEqual(['2026-09-23', '2026-09-24', '2026-09-25']);
    expect(writtenDates).toEqual(['2026-09-23', '2026-09-24', '2026-09-25']);
    expect(result.rollups).toHaveLength(3);
  });
});

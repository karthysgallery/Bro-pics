import { describe, it, expect } from 'vitest';
import { BudgetNotificationSchema, budgetSnapshotFromNotification, combineRunningCosts, forecastForMonth, friendlyService, monthKeyIST, type ExportRow } from './running-costs';

describe('running costs', () => {
  it('names Google services in plain words', () => {
    expect(friendlyService('Cloud Run').label).toBe('Website');
    expect(friendlyService('Cloud Run functions').label).toBe('Background jobs');
    expect(friendlyService('Cloud Firestore').label).toBe('Database');
    expect(friendlyService('Cloud Storage').label).toBe('Photo & file storage');
    expect(friendlyService('Something New').label).toBe('Something New');
  });

  it('uses India time for the month', () => {
    // 31 Oct 20:00 UTC is already 1 Nov in India.
    expect(monthKeyIST(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11');
  });

  it('forecasts the month in a straight line, but not on the first day', () => {
    // 47 rupees after 8 full days of a 31-day month (9 Oct 00:00 IST).
    expect(forecastForMonth(47, new Date('2026-10-08T18:30:00Z'))).toBeCloseTo((47 / 8) * 31, 1);
    expect(forecastForMonth(5, new Date('2026-10-01T02:00:00Z'))).toBeNull();
  });

  it("reads Google's budget message", () => {
    const msg = BudgetNotificationSchema.parse({
      budgetDisplayName: 'KarthysGallery website',
      costAmount: 47.126,
      costIntervalStart: '2026-09-30T18:30:00Z',
      budgetAmount: 1000,
      budgetAmountType: 'SPECIFIED_AMOUNT',
      currencyCode: 'INR',
    });
    expect(budgetSnapshotFromNotification(msg, new Date('2026-10-09T05:00:00Z'))).toMatchObject({ costAmount: 47.13, budgetAmount: 1000, currency: 'INR', month: '2026-10' });
  });

  it('prefers the complete budget total for this month and adds the per-service detail from the export', () => {
    const now = new Date('2026-10-09T05:00:00Z');
    const rows: ExportRow[] = [
      { month: '2026-10', day: '2026-10-07', service: 'Cloud Run', currency: 'INR', net: 3 },
      { month: '2026-10', day: '2026-10-08', service: 'Cloud Run', currency: 'INR', net: 4 },
      { month: '2026-10', day: '2026-10-08', service: 'Cloud Firestore', currency: 'INR', net: 1.5 },
      { month: '2026-10', day: '2026-10-08', service: 'Cloud Storage', currency: 'INR', net: 0.004 },
      { month: '2026-09', day: '2026-09-30', service: 'Cloud Run', currency: 'INR', net: 10 },
    ];
    const budget = budgetSnapshotFromNotification(
      BudgetNotificationSchema.parse({ costAmount: 47, costIntervalStart: '2026-09-30T18:30:00Z', budgetAmount: 1000, currencyCode: 'INR' }),
      now
    );
    const c = combineRunningCosts({ now, budget, budgetMonths: [{ month: '2026-09', amount: 61 }], exportRows: rows });
    expect(c.monthToDate).toBe(47);
    expect(c.monthToDateSource).toBe('budget');
    expect(c.byService.map((s) => [s.label, s.amount])).toEqual([
      ['Website', 7],
      ['Database', 1.5],
    ]);
    expect(c.daily).toEqual([
      { day: '2026-10-07', amount: 3 },
      { day: '2026-10-08', amount: 5.5 },
    ]);
    // September: the budget's complete figure (61) beats the export's partial one (10).
    expect(c.months).toEqual([
      { month: '2026-09', amount: 61 },
      { month: '2026-10', amount: 47 },
    ]);
    expect(c.forecast).toBeGreaterThan(47);
  });

  it('works with only the export, or with nothing set up yet', () => {
    const now = new Date('2026-10-09T05:00:00Z');
    const only = combineRunningCosts({ now, budget: null, budgetMonths: [], exportRows: [{ month: '2026-10', day: '2026-10-08', service: 'Cloud Run', currency: 'INR', net: 2.5 }] });
    expect([only.monthToDate, only.monthToDateSource, only.exportConfigured, only.budgetConfigured]).toEqual([2.5, 'export', true, false]);
    const none = combineRunningCosts({ now, budget: null, budgetMonths: [], exportRows: null });
    expect([none.monthToDate, none.exportConfigured, none.budgetConfigured, none.currency]).toEqual([null, false, false, 'INR']);
  });
});

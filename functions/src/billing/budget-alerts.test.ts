import { describe, it, expect, vi } from 'vitest';
vi.mock('firebase-functions', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));
import { handleBudgetMessage } from './budget-alerts';

describe('handleBudgetMessage', () => {
  it("stores Google's month-to-date spend from a budget alert", async () => {
    const save = vi.fn(async () => undefined);
    const stored = await handleBudgetMessage(
      { budgetDisplayName: 'Website', costAmount: 47.12, costIntervalStart: '2026-09-30T18:30:00Z', budgetAmount: 1000, budgetAmountType: 'SPECIFIED_AMOUNT', currencyCode: 'INR' },
      { save, now: () => new Date('2026-10-09T05:00:00Z') }
    );
    expect(stored).toMatchObject({ costAmount: 47.12, month: '2026-10', currency: 'INR', budgetAmount: 1000 });
    expect(save).toHaveBeenCalledWith(stored);
  });

  it('ignores anything else on the topic', async () => {
    const save = vi.fn();
    expect(await handleBudgetMessage({ hello: 'world' }, { save, now: () => new Date() })).toBeNull();
    expect(await handleBudgetMessage(undefined, { save, now: () => new Date() })).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});

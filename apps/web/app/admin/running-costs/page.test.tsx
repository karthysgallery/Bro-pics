import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { combineRunningCosts } from '@bro-pics/shared';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../../components/admin/template-builder/use-admin-api', () => ({ useAdminApi: () => api }));

import RunningCostsPage from './page';

const now = new Date('2026-10-09T05:00:00Z');
const withBudget = {
  ...combineRunningCosts({
    now,
    budget: { budgetName: 'Website', currency: 'INR', costAmount: 47.12, budgetAmount: 1000, periodStart: '2026-09-30T18:30:00Z', month: '2026-10', updatedAt: '2026-10-09T04:00:00Z' },
    budgetMonths: [{ month: '2026-09', amount: 61.5 }],
    exportRows: [{ month: '2026-10', day: '2026-10-08', service: 'Cloud Run', currency: 'INR', net: 19.02 }],
  }),
  checkedAt: now.toISOString(),
};

describe('admin running costs', () => {
  beforeEach(() => api.mockReset());

  it("shows this month's spend, the expected total, last month and what each part costs", async () => {
    api.mockResolvedValue(withBudget);
    render(<RunningCostsPage />);
    expect(await screen.findByText('₹47.12', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('₹61.50', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('Website')).toBeTruthy();
    expect(screen.getByText(/of ₹1,000\.00/)).toBeTruthy();
    // Both Google features connected: no setup guide.
    expect(screen.queryByText(/Connect Google/)).toBeNull();
  });

  it('explains how to connect Google when nothing is set up, and can check again', async () => {
    api.mockResolvedValue({ ...combineRunningCosts({ now, budget: null, budgetMonths: [], exportRows: null }), checkedAt: now.toISOString() });
    render(<RunningCostsPage />);
    expect(await screen.findByText('No cost figures yet')).toBeTruthy();
    expect(screen.getByText(/Monthly budget alerts/)).toBeTruthy();
    expect(screen.getByText(/Billing export — where the money goes/)).toBeTruthy();
    expect(screen.getAllByText('Not set up yet')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(api).toHaveBeenLastCalledWith('/api/admin/running-costs?fresh=1'));
  });

  it('says plainly when the export is set but cannot be read', async () => {
    api.mockResolvedValue({ ...withBudget, exportError: 'BigQuery: Access Denied', byService: [], daily: [] });
    render(<RunningCostsPage />);
    expect(await screen.findByText(/couldn.t be read: BigQuery: Access Denied/)).toBeTruthy();
  });
});

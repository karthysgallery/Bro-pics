import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminDashboardPage from './page';

vi.mock('../../lib/auth-context', () => ({
  useAuth: () => ({
    user: {
      email: 'admin@bropics.in',
      getIdToken: () => Promise.resolve('mock-token'),
    },
    loading: false,
    signOut: vi.fn(),
  }),
}));

const sampleDashboardResponse = {
  today: {
    grossRevenue: 1500000,
    netRevenue: 1400000,
    orderCount: 12,
    aov: 116666,
    refundCount: 1,
    refundTotal: 100000,
    date: '2026-09-28',
  },
  stuckPendingPayment: { count: 2, orderIds: ['order_1', 'order_2'] },
  photoValidation: { count: 3, orderIds: ['order_3', 'order_4', 'order_5'] },
  renderQueue: { queued: 1, failed: 0 },
  productionStatusCounts: {
    photo_validation: 3,
    print_rendering: 1,
    print_ready: 4,
    in_production: 5,
    quality_check: 2,
    packed: 1,
    shipped: 8,
  },
  returns: { openCount: 1, openReturnIds: ['ret_1'] },
  refunds: { pendingCount: 0, pendingAmount: 0, failedCount: 0, failedAmount: 0 },
  reviews: { pendingCount: 4 },
  operationalAlerts: [
    {
      severity: 'warning',
      title: '3 orders waiting for low-DPI photo review',
      count: 3,
      link: '/admin/orders?status=photo_validation',
      code: 'photo_validation',
    },
  ],
};

describe('AdminDashboardPage [AFE-03, AFE-12]', () => {
  it('fetches and renders live dashboard KPIs, operational alerts, and production stations', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleDashboardResponse),
    });

    render(<AdminDashboardPage />);

    expect(await screen.findByText('Operations Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Today\'s Net Revenue')).toBeInTheDocument();
    expect(screen.getByText('₹14,000')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();

    // Operational alerts
    expect(screen.getByText('3 orders waiting for low-DPI photo review')).toBeInTheDocument();

    // Production station counts
    expect(screen.getByText('Photo Review')).toBeInTheDocument();
    expect(screen.getByText('Print Ready')).toBeInTheDocument();
  });
});

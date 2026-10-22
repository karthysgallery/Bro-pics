import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminDashboardPage from './page';

const mockRole = vi.fn(() => 'admin');
vi.mock('../../lib/auth-context', () => ({
  useAuth: () => ({
    user: {
      email: 'admin@bropics.in',
      getIdToken: () => Promise.resolve('mock-token'),
      getIdTokenResult: () => Promise.resolve({ token: 'mock-token', claims: { role: mockRole() } }),
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
  it('shows today\'s numbers, what needs attention, and one card per module with its live status', async () => {
    mockRole.mockReturnValue('admin');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleDashboardResponse),
    });

    render(<AdminDashboardPage />);

    expect(await screen.findByText('₹14,000')).toBeInTheDocument();
    expect(screen.getByText('Today\'s sales')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    // 3 + 1 + 4 + 5 + 2 + 1 orders between photo check and packed
    expect(screen.getByText('16')).toBeInTheDocument();

    // What needs attention links to the right queue.
    expect(screen.getByText('3 orders waiting for low-DPI photo review').closest('a')).toHaveAttribute('href', '/admin/orders?status=photo_validation');

    // Every module an admin can use has a card; each card opens its module.
    for (const title of ['Orders & Production', 'Catalogue', 'Shop Billing', 'Customers & WhatsApp', 'Delivery', 'Website', 'Marketing & Google', 'Reports', 'Settings & Security']) {
      expect(screen.getByRole('link', { name: title })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Catalogue' })).toHaveAttribute('href', '/admin/products');
    expect(screen.getByText('16 in work · 3 photo checks · 1 returns')).toBeInTheDocument();
    expect(screen.getByText('4 reviews to approve')).toBeInTheDocument();
  });

  it('a staff member without the reports permission still gets their module cards (no numbers)', async () => {
    mockRole.mockReturnValue('staff');
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({}) });

    render(<AdminDashboardPage />);

    expect(await screen.findByRole('link', { name: 'Orders & Production' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Website' })).not.toBeInTheDocument();
    // Settings stays, opening their own sign-in security (the only settings page staff may use).
    expect(screen.getByRole('link', { name: 'Settings & Security' })).toHaveAttribute('href', '/admin/security');
    expect(screen.queryByText('Today\'s sales')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

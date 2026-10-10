import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminShell } from './AdminShell';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/admin'),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

const mockUseAuth = vi.fn();
vi.mock('../../lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockPaymentMode = vi.fn();
// The authenticator step has its own tests (AdminMfaGate.test.tsx); here it lets the shell through.
vi.mock('./AdminMfaGate', () => ({ AdminMfaGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../../lib/payment-mode-client', () => ({ getPaymentModeClient: () => mockPaymentMode() }));

describe('AdminShell [AFE-01]', () => {
  beforeEach(() => {
    mockPaymentMode.mockReset();
    mockPaymentMode.mockResolvedValue('razorpay');
  });

  it('shows access restricted when user is unauthenticated or not staff/admin', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signOut: vi.fn(),
    });

    render(
      <AdminShell>
        <div>Admin Content</div>
      </AdminShell>
    );

    expect(await screen.findByText('Access Restricted')).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('renders sidebar navigation, global search, and children for an authorized admin', async () => {
    mockUseAuth.mockReturnValue({
      user: {
        email: 'admin@bropics.in',
        getIdTokenResult: () => Promise.resolve({ claims: { role: 'admin' } }),
      },
      loading: false,
      signOut: vi.fn(),
    });

    render(
      <AdminShell>
        <div data-testid="admin-child">Dashboard Home</div>
      </AdminShell>
    );

    expect(await screen.findByTestId('admin-child')).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Orders Queue')).toBeInTheDocument();
    expect(screen.getAllByText('ADMIN').length).toBeGreaterThanOrEqual(1);
    // The old hard-coded "STAGING" badge is gone; test-payments only shows when it's true.
    expect(screen.queryByText('STAGING')).not.toBeInTheDocument();
    expect(screen.queryByText('TEST PAYMENTS')).not.toBeInTheDocument();
  });

  it('shows a TEST PAYMENTS badge while the payment provider is mock, so staff never mistake test orders for revenue', async () => {
    mockPaymentMode.mockResolvedValue('mock');
    mockUseAuth.mockReturnValue({
      user: {
        email: 'admin@karthysgallery.in',
        getIdTokenResult: () => Promise.resolve({ claims: { role: 'admin' } }),
      },
      loading: false,
      signOut: vi.fn(),
    });
    render(
      <AdminShell>
        <div data-testid="admin-child" />
      </AdminShell>
    );
    expect(await screen.findByText('TEST PAYMENTS')).toBeInTheDocument();
  });

  it('filters navigation items for a scoped role (e.g. staff only sees orders/returns/reviews)', async () => {
    mockUseAuth.mockReturnValue({
      user: {
        email: 'fulfillment@bropics.in',
        getIdTokenResult: () => Promise.resolve({ claims: { role: 'staff' } }),
      },
      loading: false,
      signOut: vi.fn(),
    });

    render(
      <AdminShell>
        <div>Staff Content</div>
      </AdminShell>
    );

    expect(await screen.findByText('Staff Content')).toBeInTheDocument();
    expect(screen.getByText('Orders Queue')).toBeInTheDocument();
    expect(screen.getByText('Returns & Refunds')).toBeInTheDocument();
    expect(screen.getByText('Reviews')).toBeInTheDocument();

    // Staff cannot see Settings, Coupons, or Content CMS
    expect(screen.queryByText('Coupons')).not.toBeInTheDocument();
    expect(screen.queryByText('Homepage Builder')).not.toBeInTheDocument();
    expect(screen.queryByText('Team & Roles')).not.toBeInTheDocument();
  });
});

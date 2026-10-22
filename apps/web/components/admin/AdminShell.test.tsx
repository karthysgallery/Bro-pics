import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminShell } from './AdminShell';

const mockPathname = vi.fn(() => '/admin');
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
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
    mockPathname.mockReturnValue('/admin');
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

  it('inside a module, the sidebar lists that module\'s pages and the other modules, for an authorized admin', async () => {
    mockPathname.mockReturnValue('/admin/products');
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
    const sidebar = screen.getByRole('navigation', { name: 'Catalogue' });
    expect(sidebar).toHaveTextContent('Products');
    expect(sidebar).toHaveTextContent('Collage designs');
    expect(sidebar).not.toHaveTextContent('Orders');
    expect(screen.getByRole('link', { name: /Products/ })).toHaveAttribute('aria-current', 'page');
    // The other modules stay one click away, and the dashboard is linked.
    expect(screen.getByRole('link', { name: /Orders & Production/ })).toHaveAttribute('href', '/admin/orders');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin');
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

  it('filters modules and pages for a scoped role (e.g. staff only sees orders/returns/reviews)', async () => {
    mockPathname.mockReturnValue('/admin/orders');
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
    const sidebar = screen.getByRole('navigation', { name: 'Orders & Production' });
    expect(sidebar).toHaveTextContent('Orders');
    expect(sidebar).toHaveTextContent('Returns & refunds');

    // Staff cannot see Coupons or the website editor; Settings only for their own sign-in security.
    expect(screen.queryByText('Coupons')).not.toBeInTheDocument();
    expect(screen.queryByText('Website')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Settings & Security/ })).toHaveAttribute('href', '/admin/security');
  });
});

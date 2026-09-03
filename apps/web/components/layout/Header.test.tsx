import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from './Header';
import { CartProvider } from '../../lib/cart-context';
import { AuthProvider } from '../../lib/auth-context';
import type { Category } from '@bro-pics/shared';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// Header calls useAuth() directly (for the sign-in trigger), which requires
// a real AuthProvider ancestor — mock firebase/auth here (not globally) so
// only this file's auth-dependent render pays that cost.
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn((_auth, callback) => {
    callback(null);
    return () => {};
  }),
}));

const categories: Category[] = [
  {
    id: 'cat_frames',
    name: 'Frames & Wall Décor',
    slug: 'frames-wall-decor',
    parentId: null,
    image: '',
    sortOrder: 1,
    isActive: true,
    seo: {},
  },
];

describe('Header', () => {
  it('renders the logo, category links, and a search input', () => {
    render(
      <AuthProvider>
        <CartProvider>
          <Header categories={categories} onCartClick={() => {}} />
        </CartProvider>
      </AuthProvider>
    );
    expect(screen.getByText('BroPics')).toBeInTheDocument();
    expect(screen.getByText('Frames & Wall Décor')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
  });

  it('shows a cart badge with the current item count', () => {
    render(
      <AuthProvider>
        <CartProvider>
          <Header categories={categories} onCartClick={() => {}} />
        </CartProvider>
      </AuthProvider>
    );
    expect(screen.getByTestId('cart-count').textContent).toBe('0');
  });

  it('shows a "Sign in" trigger when signed out, and no account modal until clicked', () => {
    render(
      <AuthProvider>
        <CartProvider>
          <Header categories={categories} onCartClick={() => {}} />
        </CartProvider>
      </AuthProvider>
    );
    expect(screen.getByLabelText('Sign in')).toBeInTheDocument();
    expect(screen.queryByTestId('account-modal')).not.toBeInTheDocument();
  });

  it('opens the account modal with PhoneSignIn when the sign-in trigger is clicked', () => {
    render(
      <AuthProvider>
        <CartProvider>
          <Header categories={categories} onCartClick={() => {}} />
        </CartProvider>
      </AuthProvider>
    );
    fireEvent.click(screen.getByLabelText('Sign in'));
    expect(screen.getByTestId('account-modal')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
  });

  it('shows an Account link to /orders (not the 404ing /account) when signed in', async () => {
    // Mocks the auth-context module itself so Header's useAuth() reports a
    // signed-in user, while CartProvider's separate useContext(AuthContext)
    // read resolves against a FRESH, un-provided context (default null) —
    // this keeps CartProvider in its signed-out/local-only path so this
    // test never touches the real firebase/firestore or firebase/functions
    // SDKs (neither is mocked in this file). (account) is a Next.js route
    // group — the parens are stripped from the URL — so the only real page
    // at apps/web/app/(account)/orders/page.tsx is reachable at /orders,
    // not /account.
    vi.resetModules();
    const React = await import('react');
    vi.doMock('../../lib/auth-context', () => ({
      AuthContext: React.createContext(null),
      useAuth: () => ({ user: { uid: 'user_1' }, loading: false }),
      AuthProvider: ({ children }: { children: React.ReactNode }) => children,
    }));

    const { Header: HeaderWithSignedInAuth } = await import('./Header');
    const { CartProvider: FreshCartProvider } = await import('../../lib/cart-context');

    render(
      <FreshCartProvider>
        <HeaderWithSignedInAuth categories={categories} onCartClick={() => {}} />
      </FreshCartProvider>
    );
    const accountLink = screen.getByLabelText('Account');
    expect(accountLink).toBeInTheDocument();
    expect(accountLink).toHaveAttribute('href', '/orders');
    expect(screen.queryByLabelText('Sign in')).not.toBeInTheDocument();

    vi.doUnmock('../../lib/auth-context');
  });
});

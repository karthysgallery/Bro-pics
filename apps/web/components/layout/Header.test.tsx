import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from './Header';
import { CartProvider } from '../../lib/cart-context';
import { AuthProvider } from '../../lib/auth-context';
import type { Category } from '@bro-pics/shared';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
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
  it('renders the logo, the search field, and a browse bar built from real categories', () => {
    render(
      <AuthProvider>
        <CartProvider>
          <Header categories={categories} onCartClick={() => {}} />
        </CartProvider>
      </AuthProvider>
    );
    // The wordmark is two spans so 'Pics' can take the accent colour.
    expect(screen.getByRole('link', { name: 'BroPics home' })).toBeInTheDocument();
    expect(screen.getByText(/frames for a brighter you/i)).toBeInTheDocument();
    // Two instances by design: the search sits inline in the logo row from
    // md, and on its own full-width row below it on phones. Exactly one is
    // ever displayed, but jsdom applies no media queries so both render.
    expect(screen.getAllByPlaceholderText('Search for frames, gifts and more...')).toHaveLength(2);
    // The second tier lists the categories passed in, not a hardcoded nav.
    expect(screen.getAllByText('Frames & Wall Décor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Shop all').length).toBeGreaterThan(0);
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

  it('links straight to /account (no modal) when signed in', async () => {
    // Mocks the auth-context module itself so Header's useAuth() reports a
    // signed-in user, while CartProvider's separate useContext(AuthContext)
    // read resolves against a FRESH, un-provided context (default null) —
    // this keeps CartProvider in its signed-out/local-only path so this
    // test never touches the real firebase/firestore or firebase/functions
    // SDKs (neither is mocked in this file).
    vi.resetModules();
    const React = await import('react');
    vi.doMock('../../lib/auth-context', () => ({
      AuthContext: React.createContext(null),
      useAuth: () => ({ user: { uid: 'user_1', phoneNumber: '+911234567890' }, loading: false, signOut: vi.fn() }),
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
    expect(accountLink.tagName).toBe('A');
    expect(accountLink).toHaveAttribute('href', '/account');
    expect(screen.queryByTestId('account-modal')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sign in')).not.toBeInTheDocument();

    vi.doUnmock('../../lib/auth-context');
  });

  it('[FE-27] replaces the hardcoded "Best sellers"/"How it works" tail with settings-driven extra nav links, keeping the category links', () => {
    render(
      <AuthProvider>
        <CartProvider>
          <Header
            categories={categories}
            onCartClick={() => {}}
            extraNavLinks={[{ label: 'Gift ideas', href: '/category/gifts' }]}
          />
        </CartProvider>
      </AuthProvider>
    );
    expect(screen.getAllByText('Gift ideas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Frames & Wall Décor').length).toBeGreaterThan(0);
    expect(screen.queryByText('Best sellers')).not.toBeInTheDocument();
    expect(screen.queryByText('How it works')).not.toBeInTheDocument();
  });

  it('[FE-27] falls back to the hardcoded tail when no extraNavLinks are given', () => {
    render(
      <AuthProvider>
        <CartProvider>
          <Header categories={categories} onCartClick={() => {}} />
        </CartProvider>
      </AuthProvider>
    );
    expect(screen.getAllByText('Best sellers').length).toBeGreaterThan(0);
    expect(screen.getAllByText('How it works').length).toBeGreaterThan(0);
  });
});

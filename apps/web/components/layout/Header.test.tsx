import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from './Header';
import { CartProvider } from '../../lib/cart-context';
import { AuthProvider } from '../../lib/auth-context';
import type { Category } from '@bro-pics/shared';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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
});

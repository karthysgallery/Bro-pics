import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from './Header';
import { CartProvider } from '../../lib/cart-context';
import type { Category } from '@bro-pics/shared';

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
      <CartProvider>
        <Header categories={categories} onCartClick={() => {}} />
      </CartProvider>
    );
    expect(screen.getByText('BroPics')).toBeInTheDocument();
    expect(screen.getByText('Frames & Wall Décor')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
  });

  it('shows a cart badge with the current item count', () => {
    render(
      <CartProvider>
        <Header categories={categories} onCartClick={() => {}} />
      </CartProvider>
    );
    expect(screen.getByTestId('cart-count').textContent).toBe('0');
  });
});

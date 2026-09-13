import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CartDrawer } from './CartDrawer';
import { CartProvider, useCart } from '../../lib/cart-context';
import { useEffect } from 'react';

// CartProvider no longer hard-requires an AuthProvider ancestor — it reads
// auth state via AuthContext directly with a null-safe fallback, treating
// "no AuthProvider" the same as "signed out". No auth mocking needed here.
const Providers = CartProvider;

function SeedCart() {
  const cart = useCart();
  useEffect(() => {
    cart.addItem({
      variantId: 'var_1',
      personalizationId: 'pers_1',
      title: 'Classic Wooden Frame — 8x12 in',
      unitPriceSnapshot: 79900,
      qty: 2,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function SeedCartWithPreview() {
  const cart = useCart();
  useEffect(() => {
    cart.addItem({
      variantId: 'var_1',
      personalizationId: 'pers_1',
      title: 'Classic Wooden Frame — 8x12 in',
      unitPriceSnapshot: 79900,
      qty: 3,
      previewUrl: 'https://example.com/preview.png',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe('CartDrawer', () => {
  it('is hidden when isOpen is false', () => {
    render(
      <Providers>
        <CartDrawer isOpen={false} onClose={() => {}} />
      </Providers>
    );
    expect(screen.queryByTestId('cart-drawer')).not.toBeInTheDocument();
  });

  it('shows line items and the running subtotal when open', () => {
    render(
      <Providers>
        <SeedCart />
        <CartDrawer isOpen={true} onClose={() => {}} />
      </Providers>
    );
    expect(screen.getByText('Classic Wooden Frame — 8x12 in')).toBeInTheDocument();
    expect(screen.getByTestId('cart-subtotal').textContent).toContain('1,598.00');
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Providers>
        <CartDrawer isOpen={true} onClose={onClose} />
      </Providers>
    );
    fireEvent.click(screen.getByLabelText('Close cart'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders a thumbnail image when the item has a previewUrl', () => {
    render(
      <Providers>
        <SeedCartWithPreview />
        <CartDrawer isOpen={true} onClose={() => {}} />
      </Providers>
    );
    expect(screen.getByRole('img', { name: 'Classic Wooden Frame — 8x12 in' })).toBeInTheDocument();
  });

  it('does not let the quantity drop below 1 when the input is cleared', () => {
    render(
      <Providers>
        <SeedCartWithPreview />
        <CartDrawer isOpen={true} onClose={() => {}} />
      </Providers>
    );
    const qtyInput = screen.getByLabelText('Quantity for Classic Wooden Frame — 8x12 in');
    fireEvent.change(qtyInput, { target: { value: '' } });
    expect((qtyInput as HTMLInputElement).value).toBe('1');
  });

  it('shows a "Proceed to Checkout" link to /checkout when the cart has items, and hides it when empty', () => {
    const { rerender } = render(
      <Providers>
        <CartDrawer isOpen={true} onClose={() => {}} />
      </Providers>
    );
    expect(screen.queryByText('Proceed to Checkout')).not.toBeInTheDocument();

    rerender(
      <Providers>
        <SeedCart />
        <CartDrawer isOpen={true} onClose={() => {}} />
      </Providers>
    );
    const link = screen.getByText('Proceed to Checkout');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/checkout');
  });
});

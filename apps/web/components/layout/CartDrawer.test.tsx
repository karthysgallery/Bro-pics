import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CartDrawer } from './CartDrawer';
import { CartProvider, useCart } from '../../lib/cart-context';
import { useEffect } from 'react';

function SeedCart() {
  const cart = useCart();
  useEffect(() => {
    cart.addItem({ variantId: 'var_1', title: 'Classic Wooden Frame — 8x12 in', unitPriceSnapshot: 79900, qty: 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe('CartDrawer', () => {
  it('is hidden when isOpen is false', () => {
    render(
      <CartProvider>
        <CartDrawer isOpen={false} onClose={() => {}} />
      </CartProvider>
    );
    expect(screen.queryByTestId('cart-drawer')).not.toBeInTheDocument();
  });

  it('shows line items and the running subtotal when open', () => {
    render(
      <CartProvider>
        <SeedCart />
        <CartDrawer isOpen={true} onClose={() => {}} />
      </CartProvider>
    );
    expect(screen.getByText('Classic Wooden Frame — 8x12 in')).toBeInTheDocument();
    expect(screen.getByTestId('cart-subtotal').textContent).toContain('1,598.00');
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <CartProvider>
        <CartDrawer isOpen={true} onClose={onClose} />
      </CartProvider>
    );
    fireEvent.click(screen.getByLabelText('Close cart'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

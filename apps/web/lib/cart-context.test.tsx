import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { CartProvider, useCart } from './cart-context';

function TestConsumer() {
  const cart = useCart();
  return (
    <div>
      <span data-testid="count">{cart.totalCount}</span>
      <span data-testid="total">{cart.totalPaise}</span>
      <span data-testid="items-length">{cart.items.length}</span>
      <span data-testid="item-0-qty">{cart.items[0]?.qty ?? ''}</span>
      <button
        onClick={() =>
          cart.addItem({ variantId: 'var_1', personalizationId: 'pers_default', title: 'Test Frame', unitPriceSnapshot: 50000, qty: 1 })
        }
      >
        Add
      </button>
      <button onClick={() => cart.updateQuantity('var_1', 'pers_default', 3)}>Set qty 3</button>
      <button onClick={() => cart.removeItem('var_1', 'pers_default')}>Remove</button>
      <button
        onClick={() =>
          cart.addItem({ variantId: 'v1', personalizationId: 'pers_a', title: 'Frame', unitPriceSnapshot: 1000, qty: 1 })
        }
      >
        Add pers_a
      </button>
      <button
        onClick={() =>
          cart.addItem({ variantId: 'v1', personalizationId: 'pers_b', title: 'Frame', unitPriceSnapshot: 1000, qty: 1 })
        }
      >
        Add pers_b
      </button>
    </div>
  );
}

describe('CartProvider / useCart', () => {
  it('starts empty', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('total').textContent).toBe('0');
  });

  it('adds an item and updates count and total', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('total').textContent).toBe('50000');
  });

  it('updates quantity and recalculates the total', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Set qty 3'));
    expect(screen.getByTestId('count').textContent).toBe('3');
    expect(screen.getByTestId('total').textContent).toBe('150000');
  });

  it('removes an item', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Remove'));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('keeps two personalizations of the same variant as separate cart lines', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    fireEvent.click(screen.getByText('Add pers_a'));
    fireEvent.click(screen.getByText('Add pers_b'));
    expect(screen.getByTestId('items-length').textContent).toBe('2');
  });

  it('merges quantity when the same variant AND personalization is added twice', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    fireEvent.click(screen.getByText('Add pers_a'));
    fireEvent.click(screen.getByText('Add pers_a'));
    expect(screen.getByTestId('items-length').textContent).toBe('1');
    expect(screen.getByTestId('item-0-qty').textContent).toBe('2');
  });

  it('stores previewUrl on an added item and preserves it through updateQuantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({
        variantId: 'v1', personalizationId: 'p1', title: 'Frame', unitPriceSnapshot: 1000, qty: 1, previewUrl: 'preview.png',
      });
    });
    expect(result.current.items[0].previewUrl).toBe('preview.png');
    act(() => result.current.updateQuantity('v1', 'p1', 2));
    expect(result.current.items[0].previewUrl).toBe('preview.png');
  });

  it('throws when useCart is called outside a CartProvider', () => {
    // Suppress the expected React error boundary console output for this negative test.
    const originalError = console.error;
    console.error = () => {};
    expect(() => render(<TestConsumer />)).toThrow('useCart must be used within a CartProvider');
    console.error = originalError;
  });
});

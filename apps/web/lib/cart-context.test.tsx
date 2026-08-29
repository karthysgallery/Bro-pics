import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CartProvider, useCart } from './cart-context';

function TestConsumer() {
  const cart = useCart();
  return (
    <div>
      <span data-testid="count">{cart.totalCount}</span>
      <span data-testid="total">{cart.totalPaise}</span>
      <button onClick={() => cart.addItem({ variantId: 'var_1', title: 'Test Frame', unitPriceSnapshot: 50000, qty: 1 })}>
        Add
      </button>
      <button onClick={() => cart.updateQuantity('var_1', 3)}>Set qty 3</button>
      <button onClick={() => cart.removeItem('var_1')}>Remove</button>
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

  it('throws when useCart is called outside a CartProvider', () => {
    // Suppress the expected React error boundary console output for this negative test.
    const originalError = console.error;
    console.error = () => {};
    expect(() => render(<TestConsumer />)).toThrow('useCart must be used within a CartProvider');
    console.error = originalError;
  });
});

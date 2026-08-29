import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LayoutChrome } from '../components/layout/LayoutChrome';
import { CartProvider } from '../lib/cart-context';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

describe('LayoutChrome', () => {
  it('renders its children between the header and footer', () => {
    render(
      <CartProvider>
        <LayoutChrome categories={[]}>
          <p>Test child content</p>
        </LayoutChrome>
      </CartProvider>
    );
    expect(screen.getByText('Test child content')).toBeInTheDocument();
    expect(screen.getAllByText('BroPics').length).toBeGreaterThan(0);
  });
});

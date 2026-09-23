import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CartDrawer } from './CartDrawer';
import { CartProvider, useCart } from '../../lib/cart-context';
import { useEffect } from 'react';

// CartProvider no longer hard-requires an AuthProvider ancestor â€” it reads
// auth state via AuthContext directly with a null-safe fallback, treating
// "no AuthProvider" the same as "signed out". No auth mocking needed here.
const Providers = CartProvider;

function SeedCart() {
  const cart = useCart();
  useEffect(() => {
    cart.addItem({
      variantId: 'var_1',
      personalizationId: 'pers_1',
      title: 'Classic Wooden Frame â€” 8x12 in',
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
      title: 'Classic Wooden Frame â€” 8x12 in',
      unitPriceSnapshot: 79900,
      qty: 3,
      previewPath: 'uploads/sess_1/previews/pers_1/slot-0.png',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe('CartDrawer — stock status', () => {
  it('shows a live out-of-stock badge fetched from the variant lookup', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ productId: 'prod_1', stockStatus: 'out_of_stock', isActive: true }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    render(
      <Providers>
        <SeedCart />
        <CartDrawer isOpen={true} onClose={() => {}} />
      </Providers>
    );

    expect(await screen.findByText('Out of stock')).toBeInTheDocument();
  });

  it('shows nothing when the variant is in stock', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ productId: 'prod_1', stockStatus: 'in_stock', isActive: true }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    render(
      <Providers>
        <SeedCart />
        <CartDrawer isOpen={true} onClose={() => {}} />
      </Providers>
    );

    await screen.findByRole('button', { name: /remove/i });
    expect(screen.queryByText('Out of stock')).not.toBeInTheDocument();
    expect(screen.queryByText('Discontinued')).not.toBeInTheDocument();
  });
});

describe('CartDrawer — move to wishlist', () => {
  it('resolves the variant\'s product, adds it to the wishlist, and removes the cart line', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ productId: 'prod_1' }) });
    global.fetch = mockFetch as unknown as typeof fetch;

    render(
      <Providers>
        <SeedCart />
        <CartDrawer isOpen={true} onClose={() => {}} />
      </Providers>
    );

    // Matched by role/regex rather than the exact label string — the
    // seeded title's em dash in this file is a pre-existing, unrelated
    // mojibake artifact (garbled across an encoding round-trip), not
    // something this test should depend on matching byte-for-byte.
    fireEvent.click(await screen.findByRole('button', { name: /move.*to wishlist/i }));

    expect(mockFetch).toHaveBeenCalledWith('/api/variants/var_1/product');
    await screen.findByText('Nothing here yet.');
    expect(JSON.parse(localStorage.getItem('bropics_wishlist') ?? '[]')).toContain('prod_1');
  });
});

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
    expect(screen.getByText('Classic Wooden Frame â€” 8x12 in')).toBeInTheDocument();
    expect(screen.getByTestId('cart-subtotal').textContent).toContain('1,598');
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

  it('resolves the previewPath to a signed URL and renders a thumbnail image', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://signed.example.com/preview.png' }),
    }) as unknown as typeof fetch;

    render(
      <Providers>
        <SeedCartWithPreview />
        <CartDrawer isOpen={true} onClose={() => {}} />
      </Providers>
    );
    const img = await screen.findByRole('img', { name: 'Classic Wooden Frame â€” 8x12 in' });
    expect(img).toHaveAttribute('src', expect.stringContaining('signed.example.com'));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/media/url?path=uploads%2Fsess_1%2Fpreviews%2Fpers_1%2Fslot-0.png'),
      expect.anything()
    );
  });

  it('does not let the quantity drop below 1', () => {
    render(
      <Providers>
        <SeedCart />
        <CartDrawer isOpen={true} onClose={() => {}} />
      </Providers>
    );
    const stepper = screen.getByLabelText('Quantity for Classic Wooden Frame â€” 8x12 in');
    const decreaseButton = within(stepper).getByLabelText('Decrease quantity');
    fireEvent.click(decreaseButton);
    expect(within(stepper).getByTestId('quantity-value').textContent).toBe('1');
    fireEvent.click(decreaseButton);
    expect(within(stepper).getByTestId('quantity-value').textContent).toBe('1');
  });

  it('shows a "Checkout" link to /checkout when the cart has items, and hides it when empty', () => {
    const { rerender } = render(
      <Providers>
        <CartDrawer isOpen={true} onClose={() => {}} />
      </Providers>
    );
    expect(screen.queryByText('Checkout')).not.toBeInTheDocument();

    rerender(
      <Providers>
        <SeedCart />
        <CartDrawer isOpen={true} onClose={() => {}} />
      </Providers>
    );
    const link = screen.getByText('Checkout');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/checkout');
  });
});

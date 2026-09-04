import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CheckoutPage from './page';

vi.mock('../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'user_1', getIdToken: () => Promise.resolve('id-token') }, loading: false })),
}));
vi.mock('../../lib/cart-context', () => ({
  useCart: vi.fn(() => ({
    items: [{ variantId: 'v1', personalizationId: 'p1', title: 'Frame', unitPriceSnapshot: 1000, qty: 1 }],
    totalPaise: 1000,
  })),
}));
vi.mock('../../components/checkout/AddressPicker', () => ({
  AddressPicker: ({ onSelect }: { onSelect: (id: string) => void }) => {
    onSelect('addr_1');
    return <div data-testid="address-picker" />;
  },
}));
vi.mock('../../lib/razorpay-checkout-script', () => ({ loadRazorpayCheckoutScript: vi.fn().mockResolvedValue(undefined) }));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('CheckoutPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    (global as unknown as { Razorpay?: unknown }).Razorpay = vi.fn().mockImplementation(() => ({ open: vi.fn() }));
  });

  it('shows a sign-in prompt when signed out', async () => {
    const { useAuth } = await import('../../lib/auth-context');
    vi.mocked(useAuth).mockReturnValueOnce({ user: null, loading: false });
    render(<CheckoutPage />);
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });

  it('calls create-order and opens Razorpay Checkout on "Place Order"', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ orderId: 'order_1', razorpayOrderId: 'order_rzp_1', amount: 1000, keyId: 'rzp_test_key' }),
    });
    render(<CheckoutPage />);

    fireEvent.click(await screen.findByText('Place Order'));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/checkout/create-order',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer id-token' }),
        })
      )
    );
    await waitFor(() => expect((global as unknown as { Razorpay: ReturnType<typeof vi.fn> }).Razorpay).toHaveBeenCalled());
  });

  it('shows the unavailable-line error when create-order returns 409', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ unavailable: [{ variantId: 'v1', reason: 'out_of_stock' }] }),
    });
    render(<CheckoutPage />);
    fireEvent.click(await screen.findByText('Place Order'));
    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
  });
});

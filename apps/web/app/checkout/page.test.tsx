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

const mockOnSnapshot = vi.fn();
const mockUnsubscribe = vi.fn();
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}));
vi.mock('../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('CheckoutPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockOnSnapshot.mockReset();
    mockUnsubscribe.mockReset();
    mockOnSnapshot.mockImplementation(() => mockUnsubscribe);
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

  it('hides the Place Order button once an order has been created, closing the double-submit window', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ orderId: 'order_1', razorpayOrderId: 'order_rzp_1', amount: 1000, keyId: 'rzp_test_key' }),
    });
    render(<CheckoutPage />);
    fireEvent.click(await screen.findByText('Place Order'));

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalled());
    expect(screen.queryByText('Place Order')).not.toBeInTheDocument();
  });

  it('subscribes to orders/{orderId} and replaces the cart summary with a confirmation once status flips to paid', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ orderId: 'order_1', razorpayOrderId: 'order_rzp_1', amount: 1000, keyId: 'rzp_test_key' }),
    });
    render(<CheckoutPage />);
    fireEvent.click(await screen.findByText('Place Order'));

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalled());
    const [, onNext] = mockOnSnapshot.mock.calls[0];
    onNext({
      exists: () => true,
      data: () => ({ status: 'paid', paymentStatus: 'paid', orderNo: 'BP-2026-00001' }),
    });

    expect(await screen.findByText(/payment confirmed/i)).toBeInTheDocument();
    expect(screen.getByText(/BP-2026-00001/)).toBeInTheDocument();
    // The cart summary (with its now-empty item list from the webhook
    // clearing the cart) must not render alongside the confirmation.
    expect(screen.queryByText('Subtotal')).not.toBeInTheDocument();
  });

  it('shows a payment-failed message (not the empty-cart summary as confirmation) when paymentStatus is failed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ orderId: 'order_1', razorpayOrderId: 'order_rzp_1', amount: 1000, keyId: 'rzp_test_key' }),
    });
    render(<CheckoutPage />);
    fireEvent.click(await screen.findByText('Place Order'));

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalled());
    const [, onNext] = mockOnSnapshot.mock.calls[0];
    onNext({
      exists: () => true,
      data: () => ({ status: 'pending_payment', paymentStatus: 'failed', orderNo: 'BP-2026-00001' }),
    });

    expect(await screen.findByText(/payment failed.*refresh/i)).toBeInTheDocument();
  });

  it('unsubscribes the order listener on unmount', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ orderId: 'order_1', razorpayOrderId: 'order_rzp_1', amount: 1000, keyId: 'rzp_test_key' }),
    });
    const { unmount } = render(<CheckoutPage />);
    fireEvent.click(await screen.findByText('Place Order'));

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalled());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});

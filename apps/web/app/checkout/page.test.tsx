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
    vi.mocked(useAuth).mockReturnValueOnce({ user: null, loading: false, signOut: vi.fn() });
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

  it('unsubscribes the order listener when the signed-in user becomes null (e.g. sign-out mid-checkout)', async () => {
    const { useAuth } = await import('../../lib/auth-context');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ orderId: 'order_1', razorpayOrderId: 'order_rzp_1', amount: 1000, keyId: 'rzp_test_key' }),
    });
    const { rerender } = render(<CheckoutPage />);
    fireEvent.click(await screen.findByText('Place Order'));

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalled());
    expect(mockUnsubscribe).not.toHaveBeenCalled();

    // Simulate the account-icon Sign Out button flipping auth state to
    // signed-out while this page still has a live orders/{orderId} listener.
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false, signOut: vi.fn() });
    rerender(<CheckoutPage />);

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});

describe('CheckoutPage coupon UI', () => {
  beforeEach(async () => {
    mockFetch.mockReset();
    mockOnSnapshot.mockReset();
    mockUnsubscribe.mockReset();
    mockOnSnapshot.mockImplementation(() => mockUnsubscribe);
    (global as unknown as { Razorpay?: unknown }).Razorpay = vi.fn().mockImplementation(() => ({ open: vi.fn() }));
    const { useAuth } = await import('../../lib/auth-context');
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user_1', getIdToken: () => Promise.resolve('id-token') }, loading: false } as unknown as ReturnType<typeof useAuth>);
  });

  // The applied-coupon message is split across a text node, a <strong>, and
  // more text nodes (e.g. "Coupon " <strong>NEW10</strong> " applied — ...")
  // so a plain regex TextMatch (which only checks a single node's own text)
  // won't find it — match on the containing element's full textContent instead.
  const findCouponAppliedMessage = (code: string) =>
    screen.findByText((_content, element) => element?.tagName === 'SPAN' && new RegExp(`coupon.*${code}.*applied`, 'i').test(element.textContent ?? ''));

  it('shows the discount on a valid coupon', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ valid: true, discountPaise: 10000, freeShipping: false }) });
    render(<CheckoutPage />);
    fireEvent.change(screen.getByLabelText(/coupon code/i), { target: { value: 'NEW10' } });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(await findCouponAppliedMessage('NEW10')).toBeInTheDocument();
  });

  it('shows a human-readable message for an invalid coupon', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ valid: false, reason: 'below_min_order' }) });
    render(<CheckoutPage />);
    fireEvent.change(screen.getByLabelText(/coupon code/i), { target: { value: 'BIGSPEND' } });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(await screen.findByText(/minimum order not met/i)).toBeInTheDocument();
  });

  it('includes couponCode in the place-order request once applied', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ valid: true, discountPaise: 10000, freeShipping: false }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ orderId: 'order_1', razorpayOrderId: 'rzp_1', amount: 90000, keyId: 'key_1' }) });
    render(<CheckoutPage />);
    fireEvent.change(screen.getByLabelText(/coupon code/i), { target: { value: 'NEW10' } });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await findCouponAppliedMessage('NEW10');

    fireEvent.click(screen.getByRole('button', { name: /place order/i }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/checkout/create-order',
        expect.objectContaining({ body: JSON.stringify({ addressId: 'addr_1', couponCode: 'NEW10' }) })
      )
    );
  });
});

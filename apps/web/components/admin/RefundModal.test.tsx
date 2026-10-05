import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RefundModal } from './RefundModal';

vi.mock('../../lib/auth-context', () => ({
  useAuth: () => ({
    user: { uid: 'admin_1', getIdToken: vi.fn().mockResolvedValue('test-token') },
    loading: false,
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Order totals are stored in PAISE: 249900 paise = ₹2,499.
function renderModal(props: Partial<React.ComponentProps<typeof RefundModal>> = {}) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  render(
    <RefundModal
      isOpen={true}
      onClose={onClose}
      orderId="ord_12345"
      orderNo="ORD-12345"
      orderTotal={249900}
      alreadyRefunded={0}
      onSuccess={onSuccess}
      {...props}
    />
  );
  return { onClose, onSuccess };
}

describe('RefundModal [AFE-20, AFE-32]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('renders order refund summary with full and partial modes, amounts shown in rupees', () => {
    renderModal();
    expect(screen.getByText(/Issue Refund for Order #ORD-12345/i)).toBeInTheDocument();
    expect(screen.getByText('Full Refund')).toBeInTheDocument();
    expect(screen.getByText('Partial Refund')).toBeInTheDocument();
    // 249900 paise must read as ₹2,499 — never as ₹249900.
    expect(screen.getAllByText('₹2,499').length).toBeGreaterThan(0);
    expect(screen.queryByText(/249900/)).not.toBeInTheDocument();
  });

  it('subtracts what was already refunded from the maximum', () => {
    renderModal({ alreadyRefunded: 100000 });
    expect(screen.getAllByText('₹1,499').length).toBeGreaterThan(0); // max refundable (summary + full-refund card)
  });

  it('enforces typed confirmation before allowing refund submission', () => {
    renderModal();
    const submitBtn = screen.getByRole('button', { name: /Authorize ₹2,499 Refund/i });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('REFUND-2499'), { target: { value: 'REFUND-2499' } });
    expect(submitBtn).not.toBeDisabled();
  });

  it('sends a full refund to the API in paise', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    const { onSuccess } = renderModal();
    fireEvent.change(screen.getByPlaceholderText('REFUND-2499'), { target: { value: 'REFUND-2499' } });
    fireEvent.click(screen.getByRole('button', { name: /Authorize ₹2,499 Refund/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.amount).toBe(249900);
  });

  it('treats the partial-amount field as RUPEES and sends paise (typing 500 refunds ₹500, not 500 paise)', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    const { onSuccess } = renderModal();
    fireEvent.click(screen.getByText('Partial Refund'));
    fireEvent.change(screen.getByLabelText(/Partial Refund Amount/i), { target: { value: '500' } });

    expect(screen.getByRole('button', { name: /Authorize ₹500 Refund/i })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('REFUND-500'), { target: { value: 'REFUND-500' } });
    fireEvent.click(screen.getByRole('button', { name: /Authorize ₹500 Refund/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.amount).toBe(50000);
  });

  it('refuses a partial amount above what is still refundable', () => {
    renderModal({ orderTotal: 100000, alreadyRefunded: 90000 }); // ₹100 left
    fireEvent.click(screen.getByText('Partial Refund'));
    fireEvent.change(screen.getByLabelText(/Partial Refund Amount/i), { target: { value: '500' } });
    fireEvent.change(screen.getByPlaceholderText('REFUND-500'), { target: { value: 'REFUND-500' } });
    expect(screen.getByRole('button', { name: /Authorize ₹500 Refund/i })).toBeDisabled();
  });
});

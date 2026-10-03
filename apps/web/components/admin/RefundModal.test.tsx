import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RefundModal } from './RefundModal';

vi.mock('../../lib/auth-context', () => ({
  useAuth: () => ({
    user: { uid: 'admin_1', getIdToken: vi.fn().mockResolvedValue('test-token') },
    loading: false,
  }),
}));

describe('RefundModal [AFE-20, AFE-32]', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders order refund summary with full and partial modes', () => {
    render(
      <RefundModal
        isOpen={true}
        onClose={mockOnClose}
        orderId="ord_12345"
        orderNo="ORD-12345"
        orderTotal={2499}
        alreadyRefunded={0}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText(/Issue Refund for Order #ORD-12345/i)).toBeInTheDocument();
    expect(screen.getByText('Full Refund')).toBeInTheDocument();
    expect(screen.getByText('Partial Refund')).toBeInTheDocument();
  });

  it('enforces typed confirmation before allowing refund submission', () => {
    render(
      <RefundModal
        isOpen={true}
        onClose={mockOnClose}
        orderId="ord_12345"
        orderNo="ORD-12345"
        orderTotal={2499}
        alreadyRefunded={0}
        onSuccess={mockOnSuccess}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Authorize ₹2499 Refund/i });
    expect(submitBtn).toBeDisabled();

    // Type the required confirmation phrase
    const confirmationInput = screen.getByPlaceholderText('REFUND-2499');
    fireEvent.change(confirmationInput, { target: { value: 'REFUND-2499' } });

    expect(submitBtn).not.toBeDisabled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccountModal } from './AccountModal';

// AccountModal no longer reads auth state — signed-in users never see it
// (Header links straight to /account instead), so it only ever renders the
// sign-in flow. No useAuth mock needed.

describe('AccountModal', () => {
  it('renders nothing when closed', () => {
    render(<AccountModal isOpen={false} onClose={() => {}} />);
    expect(screen.queryByTestId('account-modal')).not.toBeInTheDocument();
  });

  it('renders PhoneSignIn when open', () => {
    render(<AccountModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<AccountModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close sign in'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<AccountModal isOpen={true} onClose={onClose} />);
    fireEvent.click(container.querySelector('.absolute.inset-0')!);
    expect(onClose).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccountModal } from './AccountModal';
import { useAuth } from '../../lib/auth-context';

vi.mock('../../lib/auth-context', () => ({
  useAuth: vi.fn(),
}));

describe('AccountModal', () => {
  it('renders nothing when closed', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false, signOut: vi.fn() });
    render(<AccountModal isOpen={false} onClose={() => {}} />);
    expect(screen.queryByTestId('account-modal')).not.toBeInTheDocument();
  });

  it('renders PhoneSignIn when signed out', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false, signOut: vi.fn() });
    render(<AccountModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument();
  });

  it('renders the phone number, a My Orders link, and a Sign Out button when signed in', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { phoneNumber: '+911234567890' } as never,
      loading: false,
      signOut: vi.fn(),
    });
    render(<AccountModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('+911234567890')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Orders' })).toHaveAttribute('href', '/orders');
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Phone number')).not.toBeInTheDocument();
  });

  it('calls signOut and onClose when Sign Out is clicked', () => {
    const signOut = vi.fn();
    const onClose = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ user: { phoneNumber: '+911234567890' } as never, loading: false, signOut });
    render(<AccountModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
    expect(signOut).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

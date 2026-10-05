import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockPathname = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname() }));

import { SignedOutNotice } from './SignedOutNotice';

describe('SignedOutNotice', () => {
  it('sends the person back to the page they were on after signing in', () => {
    mockPathname.mockReturnValue('/checkout');
    render(<SignedOutNotice action="check out" />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin?redirect=%2Fcheckout');
    expect(screen.getByText('Sign in to check out')).toBeInTheDocument();
  });

  it('encodes nested paths safely', () => {
    mockPathname.mockReturnValue('/orders/abc123');
    render(<SignedOutNotice action="see this order" />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin?redirect=%2Forders%2Fabc123');
  });

  it('does not claim sign-in is passwordless (accounts have passwords)', () => {
    mockPathname.mockReturnValue('/orders');
    render(<SignedOutNotice action="see your orders" />);
    expect(screen.queryByText(/no password/i)).not.toBeInTheDocument();
  });
});

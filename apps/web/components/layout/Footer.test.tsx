import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from './Footer';

describe('Footer', () => {
  it('renders the policy links', () => {
    render(<Footer />);
    expect(screen.getByText('About Us')).toBeInTheDocument();
    expect(screen.getByText('FAQ')).toBeInTheDocument();
    expect(screen.getByText('Return & Refund Policy')).toBeInTheDocument();
    expect(screen.getByText('Shipping Policy')).toBeInTheDocument();
  });

  it('renders a newsletter signup form', () => {
    render(<Footer />);
    expect(screen.getByPlaceholderText('Your email address')).toBeInTheDocument();
  });
});

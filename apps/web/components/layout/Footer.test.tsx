import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from './Footer';

describe('Footer', () => {
  it('renders the policy links', () => {
    render(<Footer />);
    expect(screen.getByText('About us')).toBeInTheDocument();
    expect(screen.getByText('FAQ')).toBeInTheDocument();
    expect(screen.getByText('Return & refund policy')).toBeInTheDocument();
    expect(screen.getByText('Shipping policy')).toBeInTheDocument();
  });

  it('renders a newsletter signup form', () => {
    render(<Footer />);
    expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument();
  });
});

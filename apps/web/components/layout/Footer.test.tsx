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

  it('[FE-27] renders columns/social links from settings instead of the hardcoded defaults when given', () => {
    render(
      <Footer
        settings={{
          columns: [{ title: 'Company', links: [{ label: 'Careers', href: '/careers' }] }],
          socialLinks: [{ platform: 'YouTube', url: 'https://youtube.com/bropics' }],
        }}
      />
    );
    expect(screen.getByText('Company')).toBeInTheDocument();
    expect(screen.getByText('Careers')).toBeInTheDocument();
    expect(screen.getByText('YouTube')).toBeInTheDocument();
    expect(screen.queryByText('About us')).not.toBeInTheDocument();
    expect(screen.queryByText('Instagram')).not.toBeInTheDocument();
  });

  it('[FE-27] shows a support-phone contact line when settings/store has one', () => {
    render(<Footer supportPhone="+91 98765 43210" />);
    expect(screen.getByText(/\+91 98765 43210/)).toBeInTheDocument();
  });

  it('[FE-27] falls back to the hardcoded columns/social links when settings is absent', () => {
    render(<Footer />);
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('About us')).toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from './Footer';

describe('Footer', () => {
  it('links only the legal pages that are approved and readable', () => {
    render(<Footer liveLegalSlugs={['return-refund-policy', 'shipping-policy', 'about']} />);
    expect(screen.getByText('FAQ')).toBeInTheDocument();
    expect(screen.getByText('About us')).toBeInTheDocument();
    expect(screen.getByText('Return & refund policy')).toBeInTheDocument();
    expect(screen.getByText('Shipping policy')).toBeInTheDocument();
    expect(screen.queryByText('Privacy policy')).not.toBeInTheDocument();
    expect(screen.queryByText('Terms & conditions')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancellation policy')).not.toBeInTheDocument();
    expect(screen.queryByText('Grievance redressal')).not.toBeInTheDocument();
  });

  it('shows every policy link once all of them are approved', () => {
    render(<Footer liveLegalSlugs={['privacy', 'terms', 'shipping-policy', 'return-refund-policy', 'cancellation-policy', 'contact', 'grievance', 'about']} />);
    for (const label of ['Privacy policy', 'Terms & conditions', 'Cancellation policy', 'Grievance redressal', 'Contact']) expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows no legal link at all before anything is approved', () => {
    render(<Footer />);
    expect(screen.getByText('FAQ')).toBeInTheDocument();
    expect(screen.queryByText('Privacy policy')).not.toBeInTheDocument();
    expect(screen.queryByText('About us')).not.toBeInTheDocument();
  });

  it('does not render a signup form or placeholder social links it cannot honour', () => {
    render(<Footer />);
    expect(screen.queryByPlaceholderText('Email address')).not.toBeInTheDocument();
    expect(screen.queryByText('Instagram')).not.toBeInTheDocument();
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
    expect(screen.getByText('Careers')).toBeInTheDocument();
    expect(screen.getByText('YouTube')).toBeInTheDocument();
    expect(screen.queryByText('About us')).not.toBeInTheDocument();
    expect(screen.queryByText('Instagram')).not.toBeInTheDocument();
  });

  it('[FE-27] shows a support-phone contact line when settings/store has one', () => {
    render(<Footer supportPhone="+91 98765 43210" />);
    expect(screen.getByText(/\+91 98765 43210/)).toBeInTheDocument();
  });

  it('[FE-27] falls back to the default links when settings is absent', () => {
    render(<Footer />);
    expect(screen.getByText('FAQ')).toBeInTheDocument();
  });

  it('flattens settings columns into one list and skips "#" social placeholders', () => {
    render(
      <Footer
        settings={{
          columns: [
            { title: 'A', links: [{ label: 'Careers', href: '/careers' }] },
            { title: 'B', links: [{ label: 'Careers again', href: '/careers' }, { label: 'Press', href: '/press' }] },
          ],
          socialLinks: [{ platform: 'Instagram', url: '#' }],
        }}
      />
    );
    expect(screen.getAllByRole('link', { name: /Careers/ })).toHaveLength(1);
    expect(screen.getByText('Press')).toBeInTheDocument();
    expect(screen.queryByText('Instagram')).not.toBeInTheDocument();
  });
});

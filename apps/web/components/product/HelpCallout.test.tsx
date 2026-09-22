import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelpCallout } from './HelpCallout';

describe('HelpCallout', () => {
  it('renders a WhatsApp link using the given href', () => {
    render(<HelpCallout whatsappHref="https://wa.me/910000000000?text=hi" />);
    expect(screen.getByRole('link', { name: /whatsapp/i })).toHaveAttribute(
      'href',
      'https://wa.me/910000000000?text=hi'
    );
  });

  it('renders the support email as a mailto link', () => {
    render(<HelpCallout whatsappHref="https://wa.me/910000000000" />);
    expect(screen.getByRole('link', { name: 'support@bropics.in' })).toHaveAttribute(
      'href',
      'mailto:support@bropics.in'
    );
  });
});

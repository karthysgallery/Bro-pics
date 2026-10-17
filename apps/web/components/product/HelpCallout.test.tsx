import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelpCallout } from './HelpCallout';

describe('HelpCallout', () => {
  it('renders a WhatsApp link using the given href', () => {
    render(<HelpCallout whatsappHref="https://wa.me/910000000000?text=hi" />);
    expect(screen.getByRole('link', { name: /whatsapp/i })).toHaveAttribute('href', 'https://wa.me/910000000000?text=hi');
  });

  it('renders the saved support email as a mailto link', () => {
    render(<HelpCallout whatsappHref={null} email="help@example.test" />);
    expect(screen.getByRole('link', { name: 'help@example.test' })).toHaveAttribute('href', 'mailto:help@example.test');
    expect(screen.queryByRole('link', { name: /whatsapp/i })).toBeNull();
  });

  it('renders nothing when neither contact is saved', () => {
    const { container } = render(<HelpCallout whatsappHref={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WhatsAppButton } from './WhatsAppButton';

describe('WhatsAppButton', () => {
  it('links to wa.me with the phone number and an encoded message', () => {
    render(<WhatsAppButton phoneNumber="919876543210" message="Hi, I need help" />);
    const link = screen.getByLabelText('Chat with us on WhatsApp');
    expect(link).toHaveAttribute('href', 'https://wa.me/919876543210?text=Hi%2C%20I%20need%20help');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { CartDrawer } from './CartDrawer';
import { CartProvider } from '../../lib/cart-context';

vi.mock('../../lib/shipping-settings-client', () => ({
  getShippingSettingsClient: vi.fn().mockResolvedValue({ freeShippingThreshold: 999999999, flatShippingCharge: 5000, expressShippingCharge: 15000 }),
}));

describe('[FE-44] CartDrawer accessibility', () => {
  it('has no axe violations when open', async () => {
    const { container } = render(
      <CartProvider>
        <CartDrawer isOpen={true} onClose={() => {}} />
      </CartProvider>
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

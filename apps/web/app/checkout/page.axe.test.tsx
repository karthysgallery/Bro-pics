import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import CheckoutPage from './page';

vi.mock('../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'user_1', getIdToken: () => Promise.resolve('id-token') }, loading: false })),
}));
vi.mock('../../lib/cart-context', () => ({
  useCart: vi.fn(() => ({
    items: [{ variantId: 'v1', personalizationId: 'p1', title: 'Classic Wooden Frame — 8x12 in', unitPriceSnapshot: 79900, qty: 1 }],
    totalPaise: 79900,
  })),
}));
vi.mock('../../components/checkout/AddressPicker', () => ({
  AddressPicker: () => <div data-testid="address-picker" />,
}));
vi.mock('../../lib/razorpay-checkout-script', () => ({ loadRazorpayCheckoutScript: vi.fn().mockResolvedValue(undefined) }));
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
}));
vi.mock('../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));
vi.mock('../../lib/shipping-settings-client', () => ({
  getShippingSettingsClient: vi.fn().mockResolvedValue({ freeShippingThreshold: 150000, flatShippingCharge: 5000, expressShippingCharge: 15000 }),
}));

describe('[FE-44] Checkout page accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = render(<CheckoutPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

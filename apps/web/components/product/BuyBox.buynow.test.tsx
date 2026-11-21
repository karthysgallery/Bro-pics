import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Product, Variant } from '@bro-pics/shared';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { AuthContext } from '../../lib/auth-context';

vi.mock('../../lib/cart-context', () => ({ useCart: () => ({ addItem: vi.fn(), updateItem: vi.fn() }) }));
vi.mock('../../lib/combo-frame-context', () => ({ useComboFrame: () => null }));
vi.mock('../layout/SiteTextContext', () => ({ useSiteText: () => ({ priceNote: '', careText: '', returnsText: '' }) }));
vi.mock('../../lib/use-shipping-settings', () => ({ useShippingSettings: () => null, freeShippingPromise: () => null }));
vi.mock('../checkout/PincodeChecker', () => ({ PincodeChecker: () => null }));

import { BuyBox } from './BuyBox';

const product = { id: 'p1', slug: 'collage', title: 'Collage', minPrice: 59900, dispatchDaysMin: 1, dispatchDaysMax: 2, inStock: true, ratingCount: 0 } as unknown as Product;
const variant = { id: 'v1', sizeLabel: '8x12 in', frameColour: 'Brown', widthIn: 8, heightIn: 12, price: 59900, stockStatus: 'in_stock', sku: 'S' } as unknown as Variant;

type Auth = { user: { uid: string } | null; loading: boolean };

// Renders the buy box the way a product page does: the page's own add step sets `submitting` while it saves and
// announces a saved line with 'karthys:open-cart'.
function setup(auth: Auth) {
  const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() };
  const onAddToCart = vi.fn();
  const ui = (a: Auth, submitting: boolean) => (
    <AppRouterContext.Provider value={router as never}>
      <AuthContext.Provider value={{ user: a.user as never, loading: a.loading, signOut: vi.fn() }}>
        <BuyBox
          product={product} variants={[variant]} selectedVariant={variant} selectedSize="8x12 in" selectedColour="Brown" selectedOrientation="portrait"
          onSelectSize={vi.fn()} onSelectColour={vi.fn()} onSelectOrientation={vi.fn()}
          personalizationReady submitting={submitting} submitError={null} onAddToCart={onAddToCart}
        />
      </AuthContext.Provider>
    </AppRouterContext.Provider>
  );
  const view = render(ui(auth, false));
  return { router, onAddToCart, rerender: (a: Auth, submitting: boolean) => view.rerender(ui(a, submitting)) };
}

const saved = () => act(() => { window.dispatchEvent(new CustomEvent('karthys:open-cart')); });
const buyNow = () => fireEvent.click(screen.getAllByRole('button', { name: 'Buy now' })[0]);

describe('BuyBox Buy now', () => {
  it('waits for the line to be saved, then opens checkout in-site for a signed-in customer', () => {
    const signedIn = { user: { uid: 'u1' }, loading: false };
    const { router, onAddToCart, rerender } = setup(signedIn);
    buyNow();
    expect(onAddToCart).toHaveBeenCalledTimes(1);
    rerender(signedIn, true);
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Opening checkout…' })).toBeDisabled();
    // A second press while saving adds nothing more.
    fireEvent.click(screen.getByRole('button', { name: 'Opening checkout…' }));
    expect(onAddToCart).toHaveBeenCalledTimes(1);
    saved();
    rerender(signedIn, false);
    expect(router.push).toHaveBeenCalledWith('/checkout');
  });

  it('does not decide while the saved sign-in is still being restored (it used to send signed-in customers to sign in)', () => {
    const restoring = { user: null, loading: true };
    const { router, rerender } = setup(restoring);
    buyNow();
    rerender(restoring, true);
    saved();
    rerender(restoring, false);
    expect(router.push).not.toHaveBeenCalled();
    rerender({ user: { uid: 'u1' }, loading: false }, false);
    expect(router.push).toHaveBeenCalledWith('/checkout');
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('sends a signed-out customer to sign in, coming back to checkout', () => {
    const signedOut = { user: null, loading: false };
    const { router, rerender } = setup(signedOut);
    buyNow();
    rerender(signedOut, true);
    saved();
    rerender(signedOut, false);
    expect(router.push).toHaveBeenCalledWith('/signin?redirect=%2Fcheckout');
  });

  it('stays on the page and lets the customer try again when the add fails (nothing announced)', () => {
    const signedIn = { user: { uid: 'u1' }, loading: false };
    const { router, onAddToCart, rerender } = setup(signedIn);
    buyNow();
    rerender(signedIn, true);
    rerender(signedIn, false);
    expect(router.push).not.toHaveBeenCalled();
    // An Add to cart later on must not be taken for the earlier Buy now.
    saved();
    expect(router.push).not.toHaveBeenCalled();
    buyNow();
    expect(onAddToCart).toHaveBeenCalledTimes(2);
  });
});

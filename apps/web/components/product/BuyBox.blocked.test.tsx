import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Product, Variant } from '@bro-pics/shared';

vi.mock('../../lib/cart-context', () => ({ useCart: () => ({ addItem: vi.fn(), updateItem: vi.fn() }) }));
vi.mock('../../lib/combo-frame-context', () => ({ useComboFrame: () => null }));
vi.mock('../layout/SiteTextContext', () => ({ useSiteText: () => ({ priceNote: '', careText: '', returnsText: '' }) }));
vi.mock('../../lib/use-shipping-settings', () => ({ useShippingSettings: () => null, freeShippingPromise: () => null }));
vi.mock('../checkout/PincodeChecker', () => ({ PincodeChecker: () => null }));

import { BuyBox } from './BuyBox';

const product = { id: 'p1', slug: 'collage', title: 'Collage', minPrice: 59900, dispatchDaysMin: 1, dispatchDaysMax: 2, inStock: true, ratingCount: 0 } as unknown as Product;
const variant = { id: 'v1', sizeLabel: '8x12 in', frameColour: 'Brown', widthIn: 8, heightIn: 12, price: 59900, stockStatus: 'in_stock', sku: 'S' } as unknown as Variant;

function box(extra: Partial<React.ComponentProps<typeof BuyBox>>) {
  const onAddToCart = vi.fn();
  render(
    <BuyBox
      product={product} variants={[variant]} selectedVariant={variant} selectedSize="8x12 in" selectedColour="Brown" selectedOrientation="portrait"
      onSelectSize={vi.fn()} onSelectColour={vi.fn()} onSelectOrientation={vi.fn()}
      personalizationReady={false} personalizationReason="Photo 7 is low resolution." submitting={false} submitError={null} onAddToCart={onAddToCart} {...extra}
    />
  );
  return onAddToCart;
}

describe('BuyBox with an unfinished design', () => {
  it('keeps both Add to cart buttons pressable and asks the page to explain what is left (main button and the phone bar)', () => {
    const onBlocked = vi.fn();
    const onAddToCart = box({ onBlockedAddToCart: onBlocked });
    const buttons = screen.getAllByRole('button', { name: /Add to cart|Quick checkout/ });
    expect(buttons.length).toBe(2);
    for (const b of buttons) {
      expect((b as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(b);
    }
    expect(onBlocked).toHaveBeenCalledTimes(2);
    expect(onBlocked).toHaveBeenCalledWith(1);
    expect(onAddToCart).not.toHaveBeenCalled();
  });

  it('stays disabled when the page gives no way to explain (older pages)', () => {
    box({});
    for (const b of screen.getAllByRole('button', { name: /Add to cart|Quick checkout/ })) expect((b as HTMLButtonElement).disabled).toBe(true);
  });
});

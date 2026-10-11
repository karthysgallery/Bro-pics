import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Product, Variant } from '@bro-pics/shared';

const addItem = vi.hoisted(() => vi.fn());
const updateItem = vi.hoisted(() => vi.fn());
const comboFrame = vi.hoisted(() => ({ current: null as null | { label: string; comboName: string } }));
vi.mock('../../lib/cart-context', () => ({ useCart: () => ({ addItem, updateItem }) }));
vi.mock('../../lib/combo-frame-context', () => ({ useComboFrame: () => comboFrame.current }));
vi.mock('../layout/SiteTextContext', () => ({ useSiteText: () => ({ priceNote: 'Inclusive of taxes', careText: '', returnsText: '' }) }));
vi.mock('../../lib/use-shipping-settings', () => ({ useShippingSettings: () => null, freeShippingPromise: () => null }));
vi.mock('../checkout/PincodeChecker', () => ({ PincodeChecker: () => null }));

import { BuyBox } from './BuyBox';

const product = (glitter?: { enabled: boolean; extraPrice: number }) =>
  ({ id: 'p1', slug: 'murugan', title: 'Murugan', minPrice: 79900, dispatchDaysMin: 3, dispatchDaysMax: 5, inStock: true, ratingCount: 0, glitter }) as unknown as Product;
const variant = { id: 'v1', sizeLabel: '8x12 in', frameColour: 'Teak', widthIn: 8, heightIn: 12, price: 79900, stockStatus: 'in_stock', sku: 'S' } as unknown as Variant;

function box(p: Product, extra: Partial<React.ComponentProps<typeof BuyBox>> = {}) {
  const onAddToCart = vi.fn((_q: number, done: (id: string) => void) => done('pers1'));
  render(
    <BuyBox
      product={p} variants={[variant]} selectedVariant={variant} selectedSize="8x12 in" selectedColour="Teak" selectedOrientation="portrait"
      onSelectSize={vi.fn()} onSelectColour={vi.fn()} onSelectOrientation={vi.fn()}
      personalizationReady submitting={false} submitError={null} onAddToCart={onAddToCart} {...extra}
    />
  );
  return onAddToCart;
}

describe('BuyBox printing finish', () => {
  beforeEach(() => { addItem.mockReset(); updateItem.mockReset(); comboFrame.current = null; });

  it('offers nothing when the product has no glitter option, or has it switched off', () => {
    box(product());
    expect(screen.queryByTestId('finish-choice')).toBeNull();
  });

  it('offers nothing when glitter is switched off on the product', () => {
    box(product({ enabled: false, extraPrice: 10000 }));
    expect(screen.queryByTestId('finish-choice')).toBeNull();
  });

  it('choosing glitter adds the extra to the shown price and the cart line carries the finish', () => {
    box(product({ enabled: true, extraPrice: 10000 }));
    expect(screen.getByRole('radio', { name: /Matte/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /Glitter/ }));
    expect(screen.getByRole('radio', { name: /Glitter/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('₹899')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ finish: 'glitter', finishExtra: 10000, unitPriceSnapshot: 89900 }));
  });

  it('matte adds a plain line with no finish field', () => {
    box(product({ enabled: true, extraPrice: 10000 }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    const line = addItem.mock.calls[0]![0];
    expect(line).not.toHaveProperty('finish');
    expect(line.unitPriceSnapshot).toBe(79900);
  });

  it('is controlled by the page when it passes onFinishChange', () => {
    const onFinishChange = vi.fn();
    box(product({ enabled: true, extraPrice: 10000 }), { finish: undefined, onFinishChange });
    fireEvent.click(screen.getByRole('radio', { name: /Glitter/ }));
    expect(onFinishChange).toHaveBeenCalledWith('glitter');
  });

  it('is not offered for a frame inside a combo', () => {
    comboFrame.current = { label: 'Frame 1', comboName: 'Trio' };
    box(product({ enabled: true, extraPrice: 10000 }));
    expect(screen.queryByTestId('finish-choice')).toBeNull();
  });
});

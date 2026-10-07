import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useCart } from './cart-context';
import { ComboFrameProvider, useComboFrame, type ComboFrameInfo } from './combo-frame-context';

function Probe() {
  const { items, addItem, updateItem } = useCart();
  const frame = useComboFrame();
  return (
    <div>
      <p data-testid="label">{frame?.label}</p>
      <p data-testid="count">{items.length}</p>
      <button onClick={() => addItem({ variantId: 'v1', personalizationId: 'pf1', title: 'Frame — 8x12', unitPriceSnapshot: 50000, qty: 3, previewPath: 'previews/a.jpg', productSlug: 'classic' })}>add</button>
      <button onClick={() => updateItem('v1', 'pf1', { previewPath: 'previews/b.jpg' })}>update</button>
    </div>
  );
}

const info = (over: Partial<ComboFrameInfo> = {}): ComboFrameInfo => ({ label: 'Frame 2', comboName: 'Triple 9', saved: null, variantId: 'v1', onSave: vi.fn(), ...over });

describe('ComboFrameProvider', () => {
  it('sends a frame the editor "adds to the cart" to the combo instead, as one piece, and marks the page', () => {
    const onSave = vi.fn();
    render(<ComboFrameProvider info={info({ onSave })}><Probe /></ComboFrameProvider>);
    expect(document.body.dataset.comboFrame).toBe('true');
    expect(screen.getByTestId('label').textContent).toBe('Frame 2');

    fireEvent.click(screen.getByText('add'));
    expect(onSave).toHaveBeenCalledWith({ personalizationId: 'pf1', title: 'Frame — 8x12', previewPath: 'previews/a.jpg', productSlug: 'classic' });
    expect(screen.getByTestId('count').textContent).toBe('0'); // the real cart was never touched
  });

  it('shows an already-saved frame to the editor as its cart line, and saves edits over it', () => {
    const onSave = vi.fn();
    const saved = { personalizationId: 'pf1', title: 'Frame — 8x12', previewPath: 'previews/a.jpg' };
    render(<ComboFrameProvider info={info({ saved, onSave })}><Probe /></ComboFrameProvider>);
    expect(screen.getByTestId('count').textContent).toBe('1');

    fireEvent.click(screen.getByText('update'));
    expect(onSave).toHaveBeenCalledWith({ personalizationId: 'pf1', title: 'Frame — 8x12', previewPath: 'previews/b.jpg' });
  });

  it('clears the page marker when the frame editor goes away', () => {
    const { unmount } = render(<ComboFrameProvider info={info()}><Probe /></ComboFrameProvider>);
    unmount();
    expect(document.body.dataset.comboFrame).toBeUndefined();
  });
});

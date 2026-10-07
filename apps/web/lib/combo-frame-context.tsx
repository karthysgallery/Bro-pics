'use client';

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { CartContext, type CartContextValue, type CartItem } from './cart-context';
import type { SavedFrame } from './combo-draft';

/**
 * Personalizing one frame of a combo uses the product's own editor, unchanged. That editor
 * finishes by calling the cart ("add this line", "update this line"). Inside a combo frame the
 * cart is swapped for this sink: the finished frame is handed to the combo instead, and nothing
 * reaches the real cart until the whole combo is added.
 */
export interface ComboFrameInfo {
  /** "Frame 2" */
  label: string;
  comboName: string;
  /** This frame as saved so far, if the customer is editing it again. */
  saved: SavedFrame | null;
  /** The frame's variant, so a saved line can be rebuilt for the editor. */
  variantId: string;
  onSave: (frame: SavedFrame) => void;
}

const ComboFrameContext = createContext<ComboFrameInfo | null>(null);

/** Non-null while inside a combo frame's editor. */
export function useComboFrame(): ComboFrameInfo | null {
  return useContext(ComboFrameContext);
}

const noop = () => undefined;

export function ComboFrameProvider({ info, children }: { info: ComboFrameInfo; children: ReactNode }) {
  // The editors announce "added" with a window event that opens the cart drawer; inside a frame
  // nothing was added to the cart, so the drawer's listener checks this flag.
  useEffect(() => {
    document.body.dataset.comboFrame = 'true';
    return () => {
      delete document.body.dataset.comboFrame;
    };
  }, []);

  const cart = useMemo<CartContextValue>(() => {
    const { saved, variantId, onSave } = info;
    const savedLine: CartItem | null = saved
      ? {
          variantId,
          personalizationId: saved.personalizationId,
          title: saved.title,
          unitPriceSnapshot: 0,
          qty: 1,
          ...(saved.previewPath && { previewPath: saved.previewPath }),
          ...(saved.productSlug && { productSlug: saved.productSlug }),
          ...(saved.personalization && { personalization: saved.personalization }),
        }
      : null;
    const fromLine = (line: Pick<CartItem, 'personalizationId' | 'title' | 'previewPath' | 'productSlug' | 'personalization'>): SavedFrame => ({
      personalizationId: line.personalizationId,
      title: line.title,
      ...(line.productSlug && { productSlug: line.productSlug }),
      ...(line.previewPath && { previewPath: line.previewPath }),
      ...(line.personalization && { personalization: line.personalization }),
    });
    return {
      items: savedLine ? [savedLine] : [],
      // A frame is always one piece; quantity belongs to the combo, not the frame.
      addItem: (item) => onSave(fromLine(item)),
      updateItem: (_variantId, personalizationId, updates) =>
        onSave(fromLine({ title: saved?.title ?? '', ...saved, ...updates, personalizationId })),
      removeItem: noop,
      updateQuantity: noop,
      clearCart: noop,
      totalCount: savedLine ? 1 : 0,
      totalPaise: 0,
    };
  }, [info]);

  return (
    <ComboFrameContext.Provider value={info}>
      <CartContext.Provider value={cart}>{children}</CartContext.Provider>
    </ComboFrameContext.Provider>
  );
}

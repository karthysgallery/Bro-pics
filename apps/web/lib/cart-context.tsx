'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface CartItem {
  variantId: string;
  personalizationId: string;
  title: string;
  unitPriceSnapshot: number;
  qty: number;
}

export interface CartContextValue {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (variantId: string, personalizationId: string) => void;
  updateQuantity: (variantId: string, personalizationId: string, qty: number) => void;
  totalCount: number;
  totalPaise: number;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Local-only mock cart state for the Storefront phase — not persisted,
 * not Firestore-backed. Phase 4 replaces this provider's internals with
 * real cart persistence behind the same useCart() interface.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const value = useMemo<CartContextValue>(() => {
    const addItem = (item: CartItem) => {
      setItems((prev) => {
        const existing = prev.find(
          (i) => i.variantId === item.variantId && i.personalizationId === item.personalizationId
        );
        if (existing) {
          return prev.map((i) =>
            i.variantId === item.variantId && i.personalizationId === item.personalizationId
              ? { ...i, qty: i.qty + item.qty }
              : i
          );
        }
        return [...prev, item];
      });
    };

    const removeItem = (variantId: string, personalizationId: string) => {
      setItems((prev) => prev.filter((i) => !(i.variantId === variantId && i.personalizationId === personalizationId)));
    };

    const updateQuantity = (variantId: string, personalizationId: string, qty: number) => {
      setItems((prev) =>
        prev.map((i) =>
          i.variantId === variantId && i.personalizationId === personalizationId ? { ...i, qty } : i
        )
      );
    };

    const totalCount = items.reduce((sum, i) => sum + i.qty, 0);
    const totalPaise = items.reduce((sum, i) => sum + i.qty * i.unitPriceSnapshot, 0);

    return { items, addItem, removeItem, updateQuantity, totalCount, totalPaise };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}

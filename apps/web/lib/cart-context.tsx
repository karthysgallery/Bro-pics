'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getFirestore, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { CartLine } from '@bro-pics/shared';
import { getFirebaseApp } from './firebase-client';
import { getFirebaseFunctions } from './firebase-functions-client';
import { getOrCreateSessionId } from './session-id';
import { useAuth } from './auth-context';

export interface CartItem extends CartLine {}

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
 * Single-item merge for addItem: on a match (same variantId AND
 * personalizationId), the INCOMING item's title/previewUrl/unitPriceSnapshot
 * win and only qty is summed — matching mergeCartItems' documented contract
 * (Task 2), since incoming is always the more recently-added data.
 */
function mergeOne(prev: CartItem[], item: CartItem): CartItem[] {
  const existing = prev.find((i) => i.variantId === item.variantId && i.personalizationId === item.personalizationId);
  if (existing) {
    return prev.map((i) =>
      i.variantId === item.variantId && i.personalizationId === item.personalizationId
        ? { ...item, qty: i.qty + item.qty }
        : i
    );
  }
  return [...prev, item];
}

/**
 * Local-only React state when signed out (unchanged from the Storefront
 * phase's mock provider). Once a user signs in, this reconciles the local
 * cart into Firestore via reconcileSessionOnLogin (a one-time merge, not
 * a routine write), then switches to a live carts/{userId} subscription —
 * every add/remove/update after that point writes straight to Firestore
 * through the owner-only rule from Task 3, no server route needed.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [localItems, setLocalItems] = useState<CartItem[]>([]);
  const [firestoreItems, setFirestoreItems] = useState<CartItem[] | null>(null);
  const hasReconciledRef = useRef(false);

  useEffect(() => {
    if (!user) {
      hasReconciledRef.current = false;
      setFirestoreItems(null);
      return;
    }

    const db = getFirestore(getFirebaseApp());
    const cartRef = doc(db, 'carts', user.uid);

    if (!hasReconciledRef.current) {
      hasReconciledRef.current = true;
      const sessionId = getOrCreateSessionId();
      const reconcile = httpsCallable(getFirebaseFunctions(), 'reconcileSessionOnLogin');
      reconcile({ sessionId, cartItems: localItems })
        .then(() => setLocalItems([]))
        .catch((error) => {
          // Reconciliation failed — local cart is left untouched per the
          // spec's all-or-nothing requirement, so nothing is lost; the
          // live Firestore subscription below still starts, showing
          // whatever was already in carts/{userId} from a prior session.
          console.error('reconcileSessionOnLogin failed:', error);
        });
    }

    const unsubscribe = onSnapshot(cartRef, (snapshot) => {
      const data = snapshot.exists() ? (snapshot.data() as { items: CartItem[] }) : undefined;
      setFirestoreItems(data?.items ?? []);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const items = user ? firestoreItems ?? [] : localItems;

  const writeFirestoreItems = (next: CartItem[]) => {
    if (!user) return;
    const db = getFirestore(getFirebaseApp());
    setDoc(doc(db, 'carts', user.uid), { items: next }).catch((error) => {
      console.error('Failed to write cart to Firestore:', error);
    });
  };

  const value = useMemo<CartContextValue>(() => {
    const addItem = (item: CartItem) => {
      if (user) {
        writeFirestoreItems(mergeOne(items, item));
      } else {
        setLocalItems((prev) => mergeOne(prev, item));
      }
    };

    const removeItem = (variantId: string, personalizationId: string) => {
      const next = items.filter((i) => !(i.variantId === variantId && i.personalizationId === personalizationId));
      if (user) {
        writeFirestoreItems(next);
      } else {
        setLocalItems(next);
      }
    };

    const updateQuantity = (variantId: string, personalizationId: string, qty: number) => {
      const next = items.map((i) =>
        i.variantId === variantId && i.personalizationId === personalizationId ? { ...i, qty } : i
      );
      if (user) {
        writeFirestoreItems(next);
      } else {
        setLocalItems(next);
      }
    };

    const totalCount = items.reduce((sum, i) => sum + i.qty, 0);
    const totalPaise = items.reduce((sum, i) => sum + i.qty * i.unitPriceSnapshot, 0);

    return { items, addItem, removeItem, updateQuantity, totalCount, totalPaise };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, user]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}

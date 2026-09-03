'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getFirestore, doc, onSnapshot, runTransaction, type Firestore } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { mergeCartItems, type CartLine } from '@bro-pics/shared';
import { getFirebaseApp } from './firebase-client';
import { getFirebaseFunctions } from './firebase-functions-client';
import { getOrCreateSessionId, resetSessionId } from './session-id';
import { AuthContext } from './auth-context';

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
 * Applies a mutation to the signed-in user's carts/{userId} document inside
 * a Firestore transaction: reads the current server-side items, applies
 * `mutate`, and writes the result back atomically. This is deliberately NOT
 * a read-from-in-memory-state-then-setDoc pattern — two concurrent
 * addItem/removeItem/updateQuantity calls (two tabs, two devices, or an
 * offline queue flushing) that both read a stale in-memory `items` snapshot
 * would otherwise race, and the second `setDoc({items: next})` would
 * silently overwrite the first's write. Reading inside the transaction
 * means each mutation is applied against whatever is actually on the
 * server at commit time, never a stale local snapshot.
 */
async function applyFirestoreCartOp(
  db: Firestore,
  userId: string,
  mutate: (current: CartItem[]) => CartItem[]
): Promise<void> {
  const cartRef = doc(db, 'carts', userId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(cartRef);
    const current = snapshot.exists() ? ((snapshot.data() as { items: CartItem[] }).items ?? []) : [];
    const next = mutate(current);
    transaction.set(cartRef, { items: next });
  });
}

/**
 * Local-only React state when signed out (unchanged from the Storefront
 * phase's mock provider). Once a user signs in, this reconciles the local
 * cart into Firestore via reconcileSessionOnLogin (a one-time merge, not
 * a routine write), then switches to a live carts/{userId} subscription —
 * every add/remove/update after that point writes straight to Firestore
 * through the owner-only rule from Task 3, no server route needed.
 *
 * Auth state is read directly off AuthContext (not the throwing useAuth()
 * hook) with a null-safe fallback, so CartProvider works standalone without
 * an AuthProvider ancestor — "no AuthProvider" is treated the same as
 * "signed out" (local-only mode) rather than throwing.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const auth = useContext(AuthContext);
  const user = auth?.user ?? null;
  const [localItems, setLocalItems] = useState<CartItem[]>([]);
  const [firestoreItems, setFirestoreItems] = useState<CartItem[] | null>(null);
  const [reconcileSucceeded, setReconcileSucceeded] = useState(false);
  const hasReconciledRef = useRef(false);

  useEffect(() => {
    if (!user) {
      hasReconciledRef.current = false;
      setFirestoreItems(null);
      setReconcileSucceeded(false);
      return;
    }

    const db = getFirestore(getFirebaseApp());
    const cartRef = doc(db, 'carts', user.uid);

    if (!hasReconciledRef.current) {
      hasReconciledRef.current = true;
      const sessionId = getOrCreateSessionId();
      const reconcile = httpsCallable(getFirebaseFunctions(), 'reconcileSessionOnLogin');
      reconcile({ sessionId, cartItems: localItems })
        .then(() => {
          setLocalItems([]);
          setReconcileSucceeded(true);
          // Rotate the session id now that everything owned by it has been
          // reassigned to this user — otherwise the next person to use this
          // browser would inherit this user's session-owned uploads/cart.
          resetSessionId();
        })
        .catch((error) => {
          // Reconciliation failed — reset hasReconciledRef so signing out
          // and back in (or a remount) can retry, and leave
          // reconcileSucceeded false so `items` below keeps blending in the
          // local cart instead of trusting Firestore's state alone. Nothing
          // the user added before signing in is lost: it stays in
          // localItems and stays visible until a reconcile actually
          // succeeds.
          hasReconciledRef.current = false;
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

  // Until reconciliation has actually succeeded, treat localItems as a
  // floor and blend it with whatever Firestore currently has, rather than
  // trusting either side alone: onSnapshot can fire (with an empty/partial
  // cart) before the reconcile call resolves, and a rejected reconcile
  // must never make an add-to-cart afterwards vanish just because it went
  // to Firestore while the display was still pinned to the stale local
  // snapshot. Once reconcileSucceeded is true, localItems is empty anyway
  // (cleared in the .then() above), so this degrades to firestoreItems.
  const items = user
    ? reconcileSucceeded
      ? (firestoreItems ?? [])
      : mergeCartItems(firestoreItems ?? [], localItems)
    : localItems;

  const value = useMemo<CartContextValue>(() => {
    const runFirestoreOp = (mutate: (current: CartItem[]) => CartItem[]) => {
      if (!user) return;
      const db = getFirestore(getFirebaseApp());
      applyFirestoreCartOp(db, user.uid, mutate).catch((error) => {
        console.error('Failed to write cart to Firestore:', error);
      });
    };

    const addItem = (item: CartItem) => {
      if (user) {
        runFirestoreOp((current) => mergeOne(current, item));
      } else {
        setLocalItems((prev) => mergeOne(prev, item));
      }
    };

    const removeItem = (variantId: string, personalizationId: string) => {
      const filterOut = (current: CartItem[]) =>
        current.filter((i) => !(i.variantId === variantId && i.personalizationId === personalizationId));
      if (user) {
        runFirestoreOp(filterOut);
      } else {
        setLocalItems(filterOut);
      }
    };

    const updateQuantity = (variantId: string, personalizationId: string, qty: number) => {
      const applyQty = (current: CartItem[]) =>
        current.map((i) =>
          i.variantId === variantId && i.personalizationId === personalizationId ? { ...i, qty } : i
        );
      if (user) {
        runFirestoreOp(applyQty);
      } else {
        setLocalItems(applyQty);
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

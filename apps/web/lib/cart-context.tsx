'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getFirestore, doc, onSnapshot, runTransaction, type Firestore } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { mergeCartItems, type CartLine } from '@bro-pics/shared';
import { getFirebaseApp } from './firebase-client';
import { getFirebaseFunctions } from './firebase-functions-client';
import { resetSessionId, SESSION_ID_STORAGE_KEY } from './session-id';
import { AuthContext } from './auth-context';

export interface CartItem extends CartLine {}

const GUEST_CART_STORAGE_KEY = 'bropics_guest_cart';

function readGuestCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(GUEST_CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeGuestCart(items: CartItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage can throw in private-browsing/blocked-storage contexts —
    // guest-cart persistence is a convenience, fail silently.
  }
}

export interface CartContextValue {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (variantId: string, personalizationId: string) => void;
  updateQuantity: (variantId: string, personalizationId: string, qty: number) => void;
  updateItem: (
    variantId: string,
    personalizationId: string,
    updates: Partial<Pick<CartItem, 'title' | 'unitPriceSnapshot' | 'previewPath'>>
  ) => void;
  clearCart: () => void;
  totalCount: number;
  totalPaise: number;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Single-item merge for addItem: on a match (same variantId AND
 * personalizationId), the INCOMING item's title/previewPath/unitPriceSnapshot
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

  // Rehydrate a signed-out cart from localStorage — deliberately NOT a
  // useState lazy initializer, which would read localStorage during the
  // very first render and make the client's first paint differ from the
  // server's (the same hydration-mismatch class documented on BuyBox's
  // WhatsApp message). Loading it in an effect instead means both the
  // server render and the client's first paint start from an empty cart,
  // then upgrade one render later. Only applies if nothing has already
  // been added before this effect runs (e.g. a fast add-to-cart click).
  useEffect(() => {
    const stored = readGuestCart();
    if (stored.length > 0) {
      setLocalItems((current) => (current.length === 0 ? stored : current));
    }
  }, []);

  // Mirrors the guest cart to localStorage on every change so it survives
  // a refresh — only while signed out; a signed-in `localItems` is just
  // the transient pre-reconcile buffer, cleared once reconcile succeeds,
  // and persisting that would risk resurrecting stale items on a later
  // sign-out on the same browser.
  useEffect(() => {
    writeGuestCart(localItems);
  }, [localItems]);

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
      const sessionId = localStorage.getItem(SESSION_ID_STORAGE_KEY);
      if (!sessionId && localItems.length === 0) {
        setReconcileSucceeded(true);
      } else {
        const reconciliationKey = sessionId ?? (() => {
          const fresh = crypto.randomUUID();
          localStorage.setItem(SESSION_ID_STORAGE_KEY, fresh);
          return fresh;
        })();
        const reconcile = httpsCallable(getFirebaseFunctions(), 'reconcileSessionOnLogin');
        reconcile({ sessionId: reconciliationKey, cartItems: localItems, reconciliationId: reconciliationKey })
          .then(() => {
            setReconcileSucceeded(true);
            resetSessionId();
          })
          .catch((error) => {
            hasReconciledRef.current = false;
            console.warn('reconcileSessionOnLogin fallback:', error);
          });
      }
    }

    const unsubscribe = onSnapshot(
      cartRef,
      (snapshot) => {
        const data = snapshot.exists() ? (snapshot.data() as { items: CartItem[] }) : undefined;
        if (data?.items) {
          setFirestoreItems(data.items);
        }
      },
      (error) => {
        // Dropped listener or permission denied -> seamlessly fall back to localItems
        console.warn('Cart listener fallback to local state:', error);
      }
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const items = user
    ? firestoreItems !== null && firestoreItems.length > 0
      ? mergeCartItems(firestoreItems, localItems)
      : localItems
    : localItems;

  const value = useMemo<CartContextValue>(() => {
    const runFirestoreOp = (mutate: (current: CartItem[]) => CartItem[]) => {
      if (!user) return;
      const db = getFirestore(getFirebaseApp());
      applyFirestoreCartOp(db, user.uid, mutate).catch((error) => {
        console.warn('Firestore cart sync fallback to local:', error);
      });
    };

    const addItem = (item: CartItem) => {
      setLocalItems((prev) => mergeOne(prev, item));
      if (user) {
        runFirestoreOp((current) => mergeOne(current, item));
      }
    };

    const removeItem = (variantId: string, personalizationId: string) => {
      const filterOut = (current: CartItem[]) =>
        current.filter((i) => !(i.variantId === variantId && i.personalizationId === personalizationId));
      setLocalItems(filterOut);
      if (user) {
        runFirestoreOp(filterOut);
      }
    };

    const updateQuantity = (variantId: string, personalizationId: string, qty: number) => {
      const applyQty = (current: CartItem[]) =>
        current.map((i) =>
          i.variantId === variantId && i.personalizationId === personalizationId ? { ...i, qty } : i
        );
      setLocalItems(applyQty);
      if (user) {
        runFirestoreOp(applyQty);
      }
    };

    // [FE-16] Re-editing a cart line's personalization changes its price
    // and preview thumbnail but keeps the SAME personalizationId and qty
    // — unlike addItem's merge, which is for a genuinely new/matching
    // line and adds quantities together, this replaces exactly the
    // fields that could have changed on one already-identified line.
    const updateItem = (
      variantId: string,
      personalizationId: string,
      updates: Partial<Pick<CartItem, 'title' | 'unitPriceSnapshot' | 'previewPath'>>
    ) => {
      const applyUpdate = (current: CartItem[]) =>
        current.map((i) =>
          i.variantId === variantId && i.personalizationId === personalizationId ? { ...i, ...updates } : i
        );
      setLocalItems(applyUpdate);
      if (user) {
        runFirestoreOp(applyUpdate);
      }
    };

    const clearCart = () => {
      setLocalItems([]);
      setFirestoreItems([]);
      writeGuestCart([]);
      if (user) {
        runFirestoreOp(() => []);
      }
    };

    const totalCount = items.reduce((sum, i) => sum + i.qty, 0);
    const totalPaise = items.reduce((sum, i) => sum + i.qty * i.unitPriceSnapshot, 0);

    return { items, addItem, removeItem, updateQuantity, updateItem, clearCart, totalCount, totalPaise };
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

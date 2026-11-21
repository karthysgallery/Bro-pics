'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { productIdOfVariant, rupees, trackMeta } from './meta-pixel';
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

/**
 * Every change resolves once it is saved where the cart lives (this browser for a guest, the account cart once
 * signed in). Callers that move on to another page (Buy now) must wait for it: leaving while the save is still on
 * its way loses the line. addItem and updateItem reject when the save fails, so the product page can say so;
 * removeItem, updateQuantity and clearCart never reject (a failed save puts the cart back as the server has it), so
 * the cart drawer and checkout's after-payment clean-up can never turn into an error.
 */
export interface CartContextValue {
  items: CartItem[];
  addItem: (item: CartItem) => Promise<void>;
  removeItem: (variantId: string, personalizationId: string) => Promise<void>;
  updateQuantity: (variantId: string, personalizationId: string, qty: number) => Promise<void>;
  updateItem: (
    variantId: string,
    personalizationId: string,
    updates: Partial<Pick<CartItem, 'title' | 'unitPriceSnapshot' | 'previewPath' | 'personalization' | 'finish' | 'finishExtra'>>
  ) => Promise<void>;
  clearCart: () => Promise<void>;
  totalCount: number;
  totalPaise: number;
  /**
   * False until the cart's real contents are known: sign-in restored, the guest cart read from this browser, the
   * account cart's first read done and a guest cart carried into the account. Pages that act on an empty cart
   * (checkout's "Your cart is empty") wait for this instead of flashing the empty state.
   */
  ready: boolean;
  /** Set when a guest cart could not be carried into the account after sign-in; the lines are still shown. */
  syncError: string | null;
  /** Tries carrying the guest cart into the account again (after syncError). */
  retrySync: () => void;
}

/** Exported only so a combo frame can stand in for the cart around the existing editors (see combo-frame-context). */
export const CartContext = createContext<CartContextValue | null>(null);

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
): Promise<CartItem[]> {
  const cartRef = doc(db, 'carts', userId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(cartRef);
    const current = snapshot.exists() ? ((snapshot.data() as { items: CartItem[] }).items ?? []) : [];
    const next = mutate(current);
    transaction.set(cartRef, { items: next });
    return next;
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
  const authLoading = auth?.loading ?? false;
  const [localItems, setLocalItemsState] = useState<CartItem[]>([]);
  // The guest cart as of the latest change, readable synchronously: Buy now leaves the page right after adding,
  // so the line must reach localStorage before that, not in an effect one render later.
  const localRef = useRef<CartItem[]>([]);
  const setLocalItems = (next: CartItem[] | ((current: CartItem[]) => CartItem[])) => {
    const value = typeof next === 'function' ? next(localRef.current) : next;
    localRef.current = value;
    setLocalItemsState(value);
    return value;
  };
  const [firestoreItems, setFirestoreItems] = useState<CartItem[] | null>(null);
  const [reconcileSucceeded, setReconcileSucceeded] = useState(false);
  const [guestLoaded, setGuestLoaded] = useState(false);
  const [accountCartLoaded, setAccountCartLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const hasReconciledRef = useRef(false);
  // Account-cart saves still on their way. While any is, the screen keeps the optimistic lines instead of a
  // snapshot that may predate the save; the last server copy is kept to roll back to if a save fails.
  const pendingOpsRef = useRef(0);
  const serverItemsRef = useRef<CartItem[]>([]);
  const lastUidRef = useRef<string | null>(null);

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
    setGuestLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirrors the guest cart to localStorage on every change so it survives
  // a refresh — only while signed out; a signed-in `localItems` is just
  // the transient pre-reconcile buffer, cleared once reconcile succeeds,
  // and persisting that would risk resurrecting stale items on a later
  // sign-out on the same browser.
  useEffect(() => {
    if (!user) writeGuestCart(localItems);
  }, [localItems, user]);

  useEffect(() => {
    // A different account (or none): nothing of the previous account's cart may carry over, not even the copy kept
    // for rolling back a failed save, or it could show on a shared phone under the next person's sign-in.
    if (lastUidRef.current !== (user?.uid ?? null)) {
      // Leaving a signed-in account (sign-out or another account): lines kept in this browser while it was signed
      // in (a carry-over that failed) belong to that account, not to the next guest or account. A guest signing in
      // keeps the guest cart: that is the carry-over.
      if (lastUidRef.current !== null) {
        setLocalItems([]);
        writeGuestCart([]);
        // Its photo session too: the next sign-in would otherwise claim that session's uploads and designs.
        try {
          resetSessionId();
        } catch {
          // Storage blocked: nothing was stored to claim.
        }
      }
      lastUidRef.current = user?.uid ?? null;
      hasReconciledRef.current = false;
      serverItemsRef.current = [];
      pendingOpsRef.current = 0;
      setFirestoreItems(null);
      setReconcileSucceeded(false);
      setAccountCartLoaded(false);
      setSyncError(null);
    }
    if (!user) return;

    const db = getFirestore(getFirebaseApp());
    const cartRef = doc(db, 'carts', user.uid);

    if (!hasReconciledRef.current) {
      hasReconciledRef.current = true;
      let sessionId: string | null = null;
      try {
        sessionId = localStorage.getItem(SESSION_ID_STORAGE_KEY);
      } catch {
        // Storage blocked (some in-app browsers): carry the cart over with a fresh key.
      }
      // The latest guest lines, including one added a moment before signing in.
      const guestItems = localRef.current.length > 0 ? localRef.current : readGuestCart();
      if (!sessionId && guestItems.length === 0) {
        setReconcileSucceeded(true);
      } else {
        const reconciliationKey = sessionId ?? (() => {
          const fresh = crypto.randomUUID();
          try {
            localStorage.setItem(SESSION_ID_STORAGE_KEY, fresh);
          } catch {
            // See above: storage may be blocked.
          }
          return fresh;
        })();
        if (guestItems.length > 0 && localRef.current.length === 0) setLocalItems(guestItems);
        const reconcile = httpsCallable(getFirebaseFunctions(), 'reconcileSessionOnLogin');
        const payload = { sessionId: reconciliationKey, cartItems: guestItems, reconciliationId: reconciliationKey };
        // One retry for a dropped connection; the call is idempotent on reconciliationId.
        reconcile(payload)
          .catch(() => reconcile(payload))
          .then(() => {
            setLocalItems([]);
            // The guest copy now lives in the account cart; leaving it in
            // storage would merge it in again on the next page load.
            writeGuestCart([]);
            setSyncError(null);
            setReconcileSucceeded(true);
            resetSessionId();
          })
          .catch((error) => {
            hasReconciledRef.current = false;
            console.warn('reconcileSessionOnLogin fallback:', error);
            setSyncError("We couldn't move your cart into your account. Check your internet connection and try again.");
          });
      }
    }

    const unsubscribe = onSnapshot(
      cartRef,
      (snapshot) => {
        const data = snapshot.exists() ? (snapshot.data() as { items?: CartItem[] }) : undefined;
        // No cart document yet is an empty cart, not "still loading".
        const next = data?.items ?? [];
        serverItemsRef.current = next;
        if (pendingOpsRef.current === 0) setFirestoreItems(next);
        setAccountCartLoaded(true);
      },
      (error) => {
        // Dropped listener or permission denied -> seamlessly fall back to localItems
        console.warn('Cart listener fallback to local state:', error);
        setAccountCartLoaded(true);
      }
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, syncAttempt]);

  const items = user
    ? reconcileSucceeded
      ? (firestoreItems ?? [])
      : firestoreItems !== null && firestoreItems.length > 0
        ? mergeCartItems(firestoreItems, localItems)
        : localItems
    : localItems;

  // Known contents: signed out -> the guest cart has been read; signed in -> the account cart has been read and any
  // guest lines carried over (or the carry-over failed, which syncError explains while the lines stay visible).
  const ready = !authLoading && (user ? accountCartLoaded && (reconcileSucceeded || syncError !== null) : guestLoaded);

  const value = useMemo<CartContextValue>(() => {
    // Once signed in and reconciled, Firestore is the only copy of the
    // cart. Mutating the local buffer too would keep a shadow cart that
    // survives sign-out on a shared browser.
    const accountOwnsCart = Boolean(user) && reconcileSucceeded;
    const applyLocal = (mutate: (current: CartItem[]) => CartItem[]) => {
      if (accountOwnsCart) return;
      const next = setLocalItems(mutate);
      // Saved now, before the caller can leave the page.
      if (!user) writeGuestCart(next);
    };

    // Saves to the account cart. The screen updates at once (a transaction has no instant local copy, so the cart
    // drawer used to stay empty until the server answered and customers pressed Add to cart again); the promise
    // settles when the server has it. A failed save puts the last server copy back and rejects.
    const runFirestoreOp = async (mutate: (current: CartItem[]) => CartItem[], reportFailure = false): Promise<void> => {
      if (!user) return;
      const db = getFirestore(getFirebaseApp());
      pendingOpsRef.current += 1;
      if (accountOwnsCart) setFirestoreItems((current) => mutate(current ?? serverItemsRef.current));
      try {
        const saved = await applyFirestoreCartOp(db, user.uid, mutate);
        // Signed out or switched account while saving: this result belongs to the other account's cart.
        if (lastUidRef.current !== user.uid) return;
        serverItemsRef.current = saved;
        pendingOpsRef.current -= 1;
        if (pendingOpsRef.current === 0) setFirestoreItems(saved);
      } catch (error) {
        if (lastUidRef.current !== user.uid) return;
        pendingOpsRef.current -= 1;
        if (pendingOpsRef.current === 0) setFirestoreItems(serverItemsRef.current);
        console.warn('Firestore cart save failed:', error);
        // Before the guest cart is carried over, the line is still kept in this browser's copy.
        if (accountOwnsCart && reportFailure) throw error;
      }
    };

    const addItem = async (item: CartItem) => {
      applyLocal((prev) => mergeOne(prev, item));
      const metaId = productIdOfVariant(item.variantId);
      trackMeta('AddToCart', {
        content_ids: [metaId],
        content_name: item.title,
        content_type: 'product_group',
        contents: [{ id: metaId, quantity: item.qty, item_price: rupees(item.unitPriceSnapshot) }],
        value: rupees(item.unitPriceSnapshot * item.qty),
        currency: 'INR',
      });
      if (user) await runFirestoreOp((current) => mergeOne(current, item), true);
    };

    const removeItem = async (variantId: string, personalizationId: string) => {
      const filterOut = (current: CartItem[]) =>
        current.filter((i) => !(i.variantId === variantId && i.personalizationId === personalizationId));
      applyLocal(filterOut);
      if (user) await runFirestoreOp(filterOut);
    };

    const updateQuantity = async (variantId: string, personalizationId: string, qty: number) => {
      const applyQty = (current: CartItem[]) =>
        current.map((i) =>
          i.variantId === variantId && i.personalizationId === personalizationId ? { ...i, qty } : i
        );
      applyLocal(applyQty);
      if (user) await runFirestoreOp(applyQty);
    };

    // [FE-16] Re-editing a cart line's personalization changes its price
    // and preview thumbnail but keeps the SAME personalizationId and qty
    // — unlike addItem's merge, which is for a genuinely new/matching
    // line and adds quantities together, this replaces exactly the
    // fields that could have changed on one already-identified line.
    const updateItem = async (
      variantId: string,
      personalizationId: string,
      updates: Partial<Pick<CartItem, 'title' | 'unitPriceSnapshot' | 'previewPath' | 'personalization' | 'finish' | 'finishExtra'>>
    ) => {
      const applyUpdate = (current: CartItem[]) =>
        current.map((i) => {
          if (i.variantId !== variantId || i.personalizationId !== personalizationId) return i;
          const next = { ...i, ...updates };
          // Back to the matte print: the field goes away (the cart store cannot hold `undefined`).
          if (next.finish === undefined) delete next.finish;
          if (next.finishExtra === undefined) delete next.finishExtra;
          return next;
        });
      applyLocal(applyUpdate);
      if (user) await runFirestoreOp(applyUpdate, true);
    };

    const clearCart = async () => {
      setLocalItems([]);
      setFirestoreItems([]);
      writeGuestCart([]);
      if (user) await runFirestoreOp(() => []);
    };

    const totalCount = items.reduce((sum, i) => sum + i.qty, 0);
    const totalPaise = items.reduce((sum, i) => sum + i.qty * i.unitPriceSnapshot, 0);

    const retrySync = () => {
      setSyncError(null);
      setSyncAttempt((n) => n + 1);
    };

    return { items, addItem, removeItem, updateQuantity, updateItem, clearCart, totalCount, totalPaise, ready, syncError, retrySync };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, user, reconcileSucceeded, ready, syncError]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}

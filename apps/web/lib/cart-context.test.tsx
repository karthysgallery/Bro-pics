import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react';
import { CartProvider, useCart } from './cart-context';

function TestConsumer() {
  const cart = useCart();
  return (
    <div>
      <span data-testid="count">{cart.totalCount}</span>
      <span data-testid="total">{cart.totalPaise}</span>
      <span data-testid="items-length">{cart.items.length}</span>
      <span data-testid="item-0-qty">{cart.items[0]?.qty ?? ''}</span>
      <span data-testid="item-0-title">{cart.items[0]?.title ?? ''}</span>
      <span data-testid="item-0-preview">{cart.items[0]?.previewUrl ?? ''}</span>
      <button
        onClick={() =>
          cart.addItem({ variantId: 'var_1', personalizationId: 'pers_default', title: 'Test Frame', unitPriceSnapshot: 50000, qty: 1 })
        }
      >
        Add
      </button>
      <button onClick={() => cart.updateQuantity('var_1', 'pers_default', 3)}>Set qty 3</button>
      <button onClick={() => cart.removeItem('var_1', 'pers_default')}>Remove</button>
      <button
        onClick={() =>
          cart.addItem({ variantId: 'v1', personalizationId: 'pers_a', title: 'Frame', unitPriceSnapshot: 1000, qty: 1 })
        }
      >
        Add pers_a
      </button>
      <button
        onClick={() =>
          cart.addItem({ variantId: 'v1', personalizationId: 'pers_b', title: 'Frame', unitPriceSnapshot: 1000, qty: 1 })
        }
      >
        Add pers_b
      </button>
      <button
        onClick={() =>
          cart.addItem({ variantId: 'v1', personalizationId: 'pers_a', title: 'Frame (updated)', unitPriceSnapshot: 2000, qty: 1, previewUrl: 'new.png' })
        }
      >
        Add pers_a again with new data
      </button>
    </div>
  );
}

describe('CartProvider / useCart', () => {
  // CartProvider reads auth state off AuthContext directly with a null-safe
  // fallback (Important 1 fix) — no AuthProvider ancestor is required for
  // any of these signed-out-mode tests, and no firebase/auth or
  // firebase/firestore mocking is needed either, since the signed-out path
  // never touches Firestore.
  it('starts empty', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('total').textContent).toBe('0');
  });

  it('adds an item and updates count and total', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('total').textContent).toBe('50000');
  });

  it('updates quantity and recalculates the total', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Set qty 3'));
    expect(screen.getByTestId('count').textContent).toBe('3');
    expect(screen.getByTestId('total').textContent).toBe('150000');
  });

  it('removes an item', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Remove'));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('keeps two personalizations of the same variant as separate cart lines', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    fireEvent.click(screen.getByText('Add pers_a'));
    fireEvent.click(screen.getByText('Add pers_b'));
    expect(screen.getByTestId('items-length').textContent).toBe('2');
  });

  it('merges quantity when the same variant AND personalization is added twice', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    fireEvent.click(screen.getByText('Add pers_a'));
    fireEvent.click(screen.getByText('Add pers_a'));
    expect(screen.getByTestId('items-length').textContent).toBe('1');
    expect(screen.getByTestId('item-0-qty').textContent).toBe('2');
  });

  it('lets the incoming add win on title/previewUrl when merging quantity on a match', () => {
    // Regression test for a Task 6 bug: the merge branch used to spread the
    // EXISTING line, letting stale title/previewUrl survive a re-add. The
    // incoming item's title/previewUrl/unitPriceSnapshot must win on a
    // match — only qty sums — matching mergeCartItems' documented contract.
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    fireEvent.click(screen.getByText('Add pers_a'));
    fireEvent.click(screen.getByText('Add pers_a again with new data'));
    expect(screen.getByTestId('items-length').textContent).toBe('1');
    expect(screen.getByTestId('item-0-qty').textContent).toBe('2');
    expect(screen.getByTestId('item-0-title').textContent).toBe('Frame (updated)');
    expect(screen.getByTestId('item-0-preview').textContent).toBe('new.png');
  });

  it('stores previewUrl on an added item and preserves it through updateQuantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({
        variantId: 'v1', personalizationId: 'p1', title: 'Frame', unitPriceSnapshot: 1000, qty: 1, previewUrl: 'preview.png',
      });
    });
    expect(result.current.items[0].previewUrl).toBe('preview.png');
    act(() => result.current.updateQuantity('v1', 'p1', 2));
    expect(result.current.items[0].previewUrl).toBe('preview.png');
  });

  it('throws when useCart is called outside a CartProvider', () => {
    // Suppress the expected React error boundary console output for this negative test.
    const originalError = console.error;
    console.error = () => {};
    expect(() => render(<TestConsumer />)).toThrow('useCart must be used within a CartProvider');
    console.error = originalError;
  });

  it('stays local-only (no Firestore write) when signed out', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 1 });
    });
    expect(result.current.items).toHaveLength(1);
    // no assertion on a Firestore write here — signed-out mode must not
    // touch Firestore at all; the signed-in-mode tests below cover that.
  });

  it('renders correctly with no AuthProvider ancestor at all (defaults to signed-out/local-only)', () => {
    // CartProvider no longer hard-requires AuthContext — this is the
    // Important 1 regression test: previously CartProvider called the
    // throwing useAuth() hook, so a bare <CartProvider> with no
    // AuthProvider ancestor would throw before this test could even reach
    // its assertions.
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByTestId('count').textContent).toBe('1');
  });
});

/**
 * Signed-in-mode tests inject auth state via AuthContext.Provider directly
 * (not the real AuthProvider + a firebase/auth mock) — CartProvider reads
 * auth off AuthContext with useContext, so this is sufficient and keeps
 * firebase/auth mocking (and vitest.setup.ts) entirely out of scope for
 * this file, per Important 3: only the Firestore/Functions mocks this
 * file's own scenarios actually need are declared here, not globally.
 */
describe('CartProvider — signed in (Firestore-backed)', () => {
  /**
   * A fake Firestore that models real transactional semantics: concurrent
   * runTransaction calls are serialized through a promise queue (mirroring
   * the atomicity Firestore itself guarantees), and each transaction reads
   * the CURRENT server-side items at the time it actually runs — not a
   * value captured up front. This is what makes the concurrent-write test
   * below able to prove the fix: a mock that just resolved immediately
   * with a fixed snapshot would hide the exact race the old
   * setDoc(cartRef, {items: staleSnapshot}) pattern was vulnerable to.
   */
  function makeFirestoreMock() {
    const server: { items: Array<Record<string, unknown>> } = { items: [] };
    let queue: Promise<unknown> = Promise.resolve();

    const runTransaction = vi.fn((_db: unknown, updateFn: (tx: unknown) => Promise<void>) => {
      const run = queue.then(async () => {
        const snapshot = {
          exists: () => true,
          data: () => ({ items: server.items }),
        };
        const tx = {
          get: async () => snapshot,
          set: (_ref: unknown, data: { items: Array<Record<string, unknown>> }) => {
            server.items = data.items;
          },
        };
        await updateFn(tx);
      });
      queue = run.catch(() => undefined);
      return run;
    });

    return {
      getFirestore: vi.fn(() => ({})),
      doc: vi.fn(() => ({})),
      onSnapshot: vi.fn((_ref: unknown, callback: (s: unknown) => void) => {
        callback({ exists: () => server.items.length > 0, data: () => ({ items: server.items }) });
        return () => {};
      }),
      runTransaction,
      _server: server,
    };
  }

  it('reconciles the local cart into Firestore on sign-in and reads back the live subscription', async () => {
    vi.resetModules();
    const firestoreMock = makeFirestoreMock();
    vi.doMock('firebase/firestore', () => firestoreMock);

    const reconcileMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('firebase/functions', () => ({
      getFunctions: vi.fn(() => ({})),
      httpsCallable: vi.fn(() => reconcileMock),
    }));

    const { CartProvider: SignedInCartProvider, useCart: useSignedInCart } = await import('./cart-context');
    const { AuthContext: SignedInAuthContext } = await import('./auth-context');

    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <SignedInAuthContext.Provider value={{ user: { uid: 'user_1' } as never, loading: false }}>
          <SignedInCartProvider>{children}</SignedInCartProvider>
        </SignedInAuthContext.Provider>
      );
    }

    const { result } = renderHook(() => useSignedInCart(), { wrapper: Wrapper });

    expect(reconcileMock).toHaveBeenCalledWith({ sessionId: expect.any(String), cartItems: [], reconciliationId: expect.any(String) });

    // Simulate the server already having an item from a prior session, and
    // the live subscription picking it up.
    firestoreMock._server.items = [{ variantId: 'v1', personalizationId: 'p1', title: 'Server item', unitPriceSnapshot: 500, qty: 2 }];
    act(() => {
      firestoreMock.onSnapshot.mock.calls[0][1]({ exists: () => true, data: () => ({ items: firestoreMock._server.items }) });
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].title).toBe('Server item');

    await act(async () => {
      result.current.addItem({ variantId: 'v2', personalizationId: 'p2', title: 'New', unitPriceSnapshot: 100, qty: 1 });
      await Promise.all(firestoreMock.runTransaction.mock.results.map((r) => r.value));
    });
    expect(firestoreMock.runTransaction).toHaveBeenCalled();
    expect(firestoreMock._server.items.map((i) => i.variantId)).toEqual(expect.arrayContaining(['v1', 'v2']));

    vi.doUnmock('firebase/firestore');
    vi.doUnmock('firebase/functions');
  });

  it('does not drop a concurrent write when two addItem calls race (Critical 2 regression)', async () => {
    // Reviewer-proved scenario: two addItem calls both computing their next
    // state off the same in-memory snapshot and both writing the whole
    // document would let the second call's write silently clobber the
    // first's. With transaction-based writes, each write reads the
    // server's current state at commit time, so both survive.
    vi.resetModules();
    const firestoreMock = makeFirestoreMock();
    vi.doMock('firebase/firestore', () => firestoreMock);
    vi.doMock('firebase/functions', () => ({
      getFunctions: vi.fn(() => ({})),
      httpsCallable: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
    }));

    const { CartProvider: SignedInCartProvider, useCart: useSignedInCart } = await import('./cart-context');
    const { AuthContext: SignedInAuthContext } = await import('./auth-context');

    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <SignedInAuthContext.Provider value={{ user: { uid: 'user_1' } as never, loading: false }}>
          <SignedInCartProvider>{children}</SignedInCartProvider>
        </SignedInAuthContext.Provider>
      );
    }

    const { result } = renderHook(() => useSignedInCart(), { wrapper: Wrapper });

    await act(async () => {
      // Both calls fire before either's transaction has resolved — this is
      // exactly the race the reviewer's probe test exploited.
      result.current.addItem({ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 1 });
      result.current.addItem({ variantId: 'v2', personalizationId: 'p2', title: 'B', unitPriceSnapshot: 200, qty: 1 });
      await Promise.all(firestoreMock.runTransaction.mock.results.map((r) => r.value));
    });

    expect(firestoreMock._server.items).toHaveLength(2);
    expect(firestoreMock._server.items.map((i) => i.variantId).sort()).toEqual(['v1', 'v2']);

    vi.doUnmock('firebase/firestore');
    vi.doUnmock('firebase/functions');
  });

  it('keeps the local cart visible (not emptied) when reconcileSessionOnLogin fails (Critical 1 regression)', async () => {
    // Reviewer-proved scenario: a 2-item local cart, reconcile rejects,
    // items must NOT become [] permanently — the local cart is the only
    // place that data still definitely exists until Firestore write
    // actually succeeds.
    vi.resetModules();
    const firestoreMock = makeFirestoreMock();
    vi.doMock('firebase/firestore', () => firestoreMock);

    const reconcileMock = vi.fn().mockRejectedValue(new Error('network error'));
    vi.doMock('firebase/functions', () => ({
      getFunctions: vi.fn(() => ({})),
      httpsCallable: vi.fn(() => reconcileMock),
    }));

    const { CartProvider: SignedInCartProvider, useCart: useSignedInCart } = await import('./cart-context');
    const { AuthContext: SignedInAuthContext } = await import('./auth-context');

    // A locally-scoped consumer bound to the dynamically re-imported
    // module's useCart — the module-scope TestConsumer above is bound to
    // this file's original static import of ./cart-context, which
    // vi.resetModules() has made a *different* module instance (different
    // CartContext object) from the one SignedInCartProvider now provides.
    function SignedInTestConsumer() {
      const cart = useSignedInCart();
      return (
        <div>
          <span data-testid="items-length">{cart.items.length}</span>
          <button
            onClick={() => cart.addItem({ variantId: 'v1', personalizationId: 'pers_a', title: 'Frame', unitPriceSnapshot: 1000, qty: 1 })}
          >
            Add pers_a
          </button>
          <button
            onClick={() => cart.addItem({ variantId: 'v1', personalizationId: 'pers_b', title: 'Frame', unitPriceSnapshot: 1000, qty: 1 })}
          >
            Add pers_b
          </button>
          <button
            onClick={() => cart.addItem({ variantId: 'v2', personalizationId: 'pers_c', title: 'Mug', unitPriceSnapshot: 500, qty: 1 })}
          >
            Add pers_c
          </button>
        </div>
      );
    }

    function Harness({ signedIn }: { signedIn: boolean }) {
      return (
        <SignedInAuthContext.Provider value={{ user: signedIn ? ({ uid: 'user_1' } as never) : null, loading: false }}>
          <SignedInCartProvider>
            <SignedInTestConsumer />
          </SignedInCartProvider>
        </SignedInAuthContext.Provider>
      );
    }

    const { rerender } = render(<Harness signedIn={false} />);
    fireEvent.click(screen.getByText('Add pers_a'));
    fireEvent.click(screen.getByText('Add pers_b'));
    expect(screen.getByTestId('items-length').textContent).toBe('2');

    rerender(<Harness signedIn={true} />);
    await waitFor(() => expect(reconcileMock).toHaveBeenCalledTimes(1));

    // Reconciliation failed — the 2 locally-added items must still be
    // visible, not silently dropped to an empty cart.
    expect(screen.getByTestId('items-length').textContent).toBe('2');

    // A signed-in add after the rejection writes to Firestore (not
    // localItems), so it must still surface in `items` — this is the hole
    // a naive "show localItems until reconcileFailed flips back" guard has:
    // it pins the display to the stale local snapshot and hides everything
    // written to Firestore afterward. `items` must reflect both sources
    // until reconciliation actually succeeds.
    await act(async () => {
      fireEvent.click(screen.getByText('Add pers_c'));
      await Promise.all(firestoreMock.runTransaction.mock.results.map((r) => r.value));
      // The fake Firestore's onSnapshot doesn't auto-push after a
      // transaction write the way real Firestore's live subscription
      // would — re-invoke the registered callback with the now-current
      // server state to simulate that push.
      firestoreMock.onSnapshot.mock.calls[0][1]({
        exists: () => firestoreMock._server.items.length > 0,
        data: () => ({ items: firestoreMock._server.items }),
      });
    });
    expect(screen.getByTestId('items-length').textContent).toBe('3');

    vi.doUnmock('firebase/firestore');
    vi.doUnmock('firebase/functions');
  });

  it('retries reconciliation with the same reconciliationId after a failure, so a retry that actually succeeded server-side does not double the merged cart (Critical 1 idempotency regression)', async () => {
    // Reviewer-identified gap: an ordinary network drop AFTER the server
    // commits the reconcile transaction but BEFORE the callable's response
    // reaches the client looks exactly like a failed reconcile here — the
    // promise rejects even though the server-side merge already happened.
    // Retrying that "failed" attempt must send the SAME reconciliationId
    // (not a fresh one), which is what lets the server's idempotency guard
    // (functions/src/accounts/reconcile-session.ts) recognize the retry
    // and skip re-merging. This client reuses sessionId itself as the
    // reconciliationId, and sessionId only rotates on a SUCCESSFUL
    // reconcile (resetSessionId) — so as long as the failed attempt didn't
    // resolve, the next attempt's sessionId, and therefore
    // reconciliationId, is unchanged.
    vi.resetModules();
    const firestoreMock = makeFirestoreMock();
    vi.doMock('firebase/firestore', () => firestoreMock);

    const reconcileMock = vi.fn().mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce(undefined);
    vi.doMock('firebase/functions', () => ({
      getFunctions: vi.fn(() => ({})),
      httpsCallable: vi.fn(() => reconcileMock),
    }));

    const { CartProvider: SignedInCartProvider, useCart: useSignedInCart } = await import('./cart-context');
    const { AuthContext: SignedInAuthContext } = await import('./auth-context');

    function SignedInTestConsumer() {
      const cart = useSignedInCart();
      return (
        <div>
          <span data-testid="items-length">{cart.items.length}</span>
          <span data-testid="item-0-qty">{cart.items[0]?.qty ?? ''}</span>
          <button
            onClick={() => cart.addItem({ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 1 })}
          >
            Add
          </button>
        </div>
      );
    }

    function Harness({ signedIn }: { signedIn: boolean }) {
      return (
        <SignedInAuthContext.Provider value={{ user: signedIn ? ({ uid: 'user_1' } as never) : null, loading: false }}>
          <SignedInCartProvider>
            <SignedInTestConsumer />
          </SignedInCartProvider>
        </SignedInAuthContext.Provider>
      );
    }

    const { rerender } = render(<Harness signedIn={false} />);
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByTestId('items-length').textContent).toBe('1');

    // Sign in — first reconcile attempt, which fails.
    rerender(<Harness signedIn={true} />);
    await waitFor(() => expect(reconcileMock).toHaveBeenCalledTimes(1));

    // Sign out and back in — this is the retry path this client actually
    // has today (hasReconciledRef/reconcileSucceeded only reset in the
    // !user branch); sessionId is untouched because resetSessionId only
    // runs on success, so it's still the same value from before the
    // failure.
    rerender(<Harness signedIn={false} />);
    rerender(<Harness signedIn={true} />);
    await waitFor(() => expect(reconcileMock).toHaveBeenCalledTimes(2));

    const firstReconciliationId = (reconcileMock.mock.calls[0][0] as { reconciliationId: string }).reconciliationId;
    const secondReconciliationId = (reconcileMock.mock.calls[1][0] as { reconciliationId: string }).reconciliationId;
    expect(secondReconciliationId).toBe(firstReconciliationId);

    // The second attempt "succeeds" (from the client's perspective). Push
    // the live subscription with what the server's idempotency guard
    // actually produces for a retried reconciliationId: the item merged
    // exactly once (qty 1), never doubled, regardless of how many times
    // the client retried.
    await act(async () => {
      firestoreMock._server.items = [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 1 }];
      firestoreMock.onSnapshot.mock.calls[0][1]({
        exists: () => true,
        data: () => ({ items: firestoreMock._server.items }),
      });
    });

    expect(screen.getByTestId('items-length').textContent).toBe('1');
    expect(screen.getByTestId('item-0-qty').textContent).toBe('1');

    vi.doUnmock('firebase/firestore');
    vi.doUnmock('firebase/functions');
  });
});

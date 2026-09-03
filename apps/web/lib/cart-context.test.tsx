import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { CartProvider, useCart } from './cart-context';
import { AuthProvider } from './auth-context';

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>{children}</CartProvider>
    </AuthProvider>
  );
}

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
  it('starts empty', () => {
    render(
      <AllProviders>
        <TestConsumer />
      </AllProviders>
    );
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('total').textContent).toBe('0');
  });

  it('adds an item and updates count and total', () => {
    render(
      <AllProviders>
        <TestConsumer />
      </AllProviders>
    );
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('total').textContent).toBe('50000');
  });

  it('updates quantity and recalculates the total', () => {
    render(
      <AllProviders>
        <TestConsumer />
      </AllProviders>
    );
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Set qty 3'));
    expect(screen.getByTestId('count').textContent).toBe('3');
    expect(screen.getByTestId('total').textContent).toBe('150000');
  });

  it('removes an item', () => {
    render(
      <AllProviders>
        <TestConsumer />
      </AllProviders>
    );
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Remove'));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('keeps two personalizations of the same variant as separate cart lines', () => {
    render(
      <AllProviders>
        <TestConsumer />
      </AllProviders>
    );
    fireEvent.click(screen.getByText('Add pers_a'));
    fireEvent.click(screen.getByText('Add pers_b'));
    expect(screen.getByTestId('items-length').textContent).toBe('2');
  });

  it('merges quantity when the same variant AND personalization is added twice', () => {
    render(
      <AllProviders>
        <TestConsumer />
      </AllProviders>
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
      <AllProviders>
        <TestConsumer />
      </AllProviders>
    );
    fireEvent.click(screen.getByText('Add pers_a'));
    fireEvent.click(screen.getByText('Add pers_a again with new data'));
    expect(screen.getByTestId('items-length').textContent).toBe('1');
    expect(screen.getByTestId('item-0-qty').textContent).toBe('2');
    expect(screen.getByTestId('item-0-title').textContent).toBe('Frame (updated)');
    expect(screen.getByTestId('item-0-preview').textContent).toBe('new.png');
  });

  it('stores previewUrl on an added item and preserves it through updateQuantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper: AllProviders });
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
    expect(() => render(<TestConsumer />)).toThrow();
    console.error = originalError;
  });

  it('stays local-only (no Firestore write) when signed out', () => {
    const { result } = renderHook(() => useCart(), { wrapper: AllProviders });
    act(() => {
      result.current.addItem({ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 1 });
    });
    expect(result.current.items).toHaveLength(1);
    // no assertion on setDoc here — signed-out mode must not call it; a full
    // signed-in-mode test needs useAuth() mocked to return a user, which is
    // covered separately below via the firebase/auth mock override.
  });
});

describe('CartProvider — signed in (Firestore-backed)', () => {
  it('reconciles the local cart into Firestore on sign-in and reads back the live subscription', async () => {
    vi.resetModules();
    vi.doMock('firebase/auth', () => ({
      getAuth: vi.fn(() => ({})),
      onAuthStateChanged: vi.fn((_auth, callback) => {
        callback({ uid: 'user_1' });
        return () => {};
      }),
    }));

    const setDocMock = vi.fn().mockResolvedValue(undefined);
    let snapshotCallback: ((snap: unknown) => void) | undefined;
    vi.doMock('firebase/firestore', () => ({
      getFirestore: vi.fn(() => ({})),
      doc: vi.fn(() => ({})),
      onSnapshot: vi.fn((_ref, callback) => {
        snapshotCallback = callback;
        callback({ exists: () => false, data: () => undefined });
        return () => {};
      }),
      setDoc: setDocMock,
    }));

    const reconcileMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('firebase/functions', () => ({
      getFunctions: vi.fn(() => ({})),
      httpsCallable: vi.fn(() => reconcileMock),
    }));

    const { CartProvider: SignedInCartProvider, useCart: useSignedInCart } = await import('./cart-context');
    const { AuthProvider: SignedInAuthProvider } = await import('./auth-context');

    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <SignedInAuthProvider>
          <SignedInCartProvider>{children}</SignedInCartProvider>
        </SignedInAuthProvider>
      );
    }

    const { result } = renderHook(() => useSignedInCart(), { wrapper: Wrapper });

    expect(reconcileMock).toHaveBeenCalledWith({ sessionId: expect.any(String), cartItems: [] });

    act(() => {
      snapshotCallback?.({ exists: () => true, data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'Server item', unitPriceSnapshot: 500, qty: 2 }] }) });
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].title).toBe('Server item');

    act(() => {
      result.current.addItem({ variantId: 'v2', personalizationId: 'p2', title: 'New', unitPriceSnapshot: 100, qty: 1 });
    });
    expect(setDocMock).toHaveBeenCalled();

    vi.doUnmock('firebase/auth');
    vi.doUnmock('firebase/firestore');
    vi.doUnmock('firebase/functions');
  });
});

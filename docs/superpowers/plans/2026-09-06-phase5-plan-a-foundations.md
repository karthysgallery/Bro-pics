# Phase 5, Plan A — Sign-Out & Order Timeline Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sign-out path (currently missing anywhere in the app) and make `orders/{orderId}.status` actually mirror its most recent `OrderEvent` by writing real events for the `pending_payment` and `paid` transitions, which today happen with no event at all.

**Architecture:** Two independent slices. Slice 1 (sign-out) adds a `signOut()` function to the existing `AuthContext` and makes the account icon always open the existing `AccountModal`, which now branches on sign-in state. Slice 2 (order timeline) adds one more write to two existing atomic units (`create-order`'s batch, the webhook's transaction) and adjusts one read-side rendering condition — no new schema, no new collection, no new route.

**Tech Stack:** Next.js App Router (`apps/web`), Firebase Auth (client SDK) and Admin SDK, Firebase Cloud Functions v2 (`functions`), Vitest + Testing Library, Zod schemas in `@bro-pics/shared`.

## Global Constraints

- Every new/changed piece of business logic gets a test in the same task that introduces it — no task ends with untested behavior.
- Follow this codebase's existing patterns exactly: relative imports (no path aliases), `'use client'` at the top of client components, Zod `.parse()` at every Firestore write boundary that already does this (order/event writes), and this project's established fake-transaction test style (`razorpay.test.ts`'s `makePaymentTx`, `create-order/route.test.ts`'s `mockDb`) rather than a real Firestore emulator for unit tests.
- Do not touch `/staff/orders`, its routes, or anything role-management-related — those are Plan B/C's scope, not this plan's.
- Do not backfill any existing order — there are no live customer orders yet (confirmed in the design doc, §1).
- Branch: `feature/admin-panel-and-production-queue`. Commit after every task.

---

### Task 1: `signOut()` on `AuthContext`

**Files:**
- Modify: `apps/web/lib/auth-context.tsx`
- Test: `apps/web/lib/auth-context.test.tsx`

**Interfaces:**
- Produces: `AuthContextValue.signOut: () => Promise<void>` — consumed by Task 2 (`AccountModal`).

- [ ] **Step 1: Write the failing test**

Add to `apps/web/lib/auth-context.test.tsx` (extend the existing `vi.mock('firebase/auth', ...)` at the top of the file with a `signOut` export, and add `fireEvent`/`waitFor` to the Testing Library import):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth-context';

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn((_auth, callback) => {
    callback(null);
    return () => {};
  }),
  signOut: vi.fn().mockResolvedValue(undefined),
}));
```

Add this test at the end of the `describe('AuthProvider / useAuth', ...)` block:

```tsx
  it('signOut() calls Firebase Auth signOut', async () => {
    const { signOut: mockedFirebaseSignOut } = await import('firebase/auth');

    function SignOutProbe() {
      const { signOut } = useAuth();
      return <button onClick={() => signOut()}>Sign out</button>;
    }

    render(
      <AuthProvider>
        <SignOutProbe />
      </AuthProvider>
    );
    fireEvent.click(screen.getByText('Sign out'));
    await waitFor(() => expect(mockedFirebaseSignOut).toHaveBeenCalled());
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- auth-context.test.tsx`
Expected: FAIL — `useAuth()` returns no `signOut` property, so `signOut()` is not a function.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `apps/web/lib/auth-context.tsx` with:

```tsx
'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getAuth, onAuthStateChanged, signOut as firebaseSignOut, type User as FirebaseUser } from 'firebase/auth';
import { getFirebaseApp } from './firebase-client';

interface AuthContextValue {
  user: FirebaseUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth(getFirebaseApp());
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signOut = () => firebaseSignOut(getAuth(getFirebaseApp()));

  return <AuthContext.Provider value={{ user, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- auth-context.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/auth-context.tsx apps/web/lib/auth-context.test.tsx
git commit -m "feat(auth): add signOut() to AuthContext"
```

---

### Task 2: `AccountModal` branches on sign-in state

**Files:**
- Modify: `apps/web/components/layout/AccountModal.tsx`
- Create: `apps/web/components/layout/AccountModal.test.tsx`

**Interfaces:**
- Consumes: `useAuth(): { user: FirebaseUser | null; loading: boolean; signOut: () => Promise<void> }` (Task 1). `FirebaseUser.phoneNumber: string | null`.
- Produces: `AccountModal` unchanged public props (`isOpen: boolean`, `onClose: () => void`) — Task 3 relies on this signature staying the same.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/layout/AccountModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccountModal } from './AccountModal';
import { useAuth } from '../../lib/auth-context';

vi.mock('../../lib/auth-context', () => ({
  useAuth: vi.fn(),
}));

describe('AccountModal', () => {
  it('renders nothing when closed', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false, signOut: vi.fn() });
    render(<AccountModal isOpen={false} onClose={() => {}} />);
    expect(screen.queryByTestId('account-modal')).not.toBeInTheDocument();
  });

  it('renders PhoneSignIn when signed out', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false, signOut: vi.fn() });
    render(<AccountModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument();
  });

  it('renders the phone number, a My Orders link, and a Sign Out button when signed in', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { phoneNumber: '+911234567890' } as never,
      loading: false,
      signOut: vi.fn(),
    });
    render(<AccountModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('+911234567890')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Orders' })).toHaveAttribute('href', '/orders');
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Phone number')).not.toBeInTheDocument();
  });

  it('calls signOut and onClose when Sign Out is clicked', () => {
    const signOut = vi.fn();
    const onClose = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ user: { phoneNumber: '+911234567890' } as never, loading: false, signOut });
    render(<AccountModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
    expect(signOut).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- AccountModal.test.tsx`
Expected: FAIL — `AccountModal` doesn't call `useAuth()` yet, so the signed-in branch and its test assertions (phone number, `My Orders` link, `Sign Out` button) don't exist.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `apps/web/components/layout/AccountModal.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import { PhoneSignIn } from '../auth/PhoneSignIn';
import { useAuth } from '../../lib/auth-context';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountModal({ isOpen, onClose }: AccountModalProps) {
  const { user, signOut } = useAuth();
  if (!isOpen) return null;

  const handleSignOut = () => {
    signOut();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="account-modal">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
      <div className="relative bg-cream w-full max-w-sm rounded p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">{user ? 'My account' : 'Sign in'}</h2>
          <button
            aria-label={user ? 'Close account menu' : 'Close sign in'}
            onClick={onClose}
            className="text-charcoal"
          >
            ✕
          </button>
        </div>
        {user ? (
          <div className="flex flex-col gap-3">
            <p>{user.phoneNumber}</p>
            <Link href="/orders" className="text-sage underline">
              My Orders
            </Link>
            <button onClick={handleSignOut} className="rounded bg-charcoal text-cream px-4 py-2 w-fit">
              Sign Out
            </button>
          </div>
        ) : (
          <PhoneSignIn onSignedIn={onClose} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- AccountModal.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/layout/AccountModal.tsx apps/web/components/layout/AccountModal.test.tsx
git commit -m "feat(auth): AccountModal shows account info and sign-out when signed in"
```

---

### Task 3: Header's account icon always opens `AccountModal`

**Files:**
- Modify: `apps/web/components/layout/Header.tsx`
- Modify: `apps/web/components/layout/Header.test.tsx`

**Interfaces:**
- Consumes: `AccountModal` from Task 2 (unchanged props).

- [ ] **Step 1: Write the failing test**

In `apps/web/components/layout/Header.test.tsx`, replace the existing test `'shows an Account link to /orders (not the 404ing /account) when signed in'` (the whole `it(...)` block, lines 86-118) with:

```tsx
  it('opens the account modal (not a direct link) when the Account icon is clicked while signed in', async () => {
    // Mocks the auth-context module itself so Header's useAuth() reports a
    // signed-in user, while CartProvider's separate useContext(AuthContext)
    // read resolves against a FRESH, un-provided context (default null) —
    // this keeps CartProvider in its signed-out/local-only path so this
    // test never touches the real firebase/firestore or firebase/functions
    // SDKs (neither is mocked in this file).
    vi.resetModules();
    const React = await import('react');
    vi.doMock('../../lib/auth-context', () => ({
      AuthContext: React.createContext(null),
      useAuth: () => ({ user: { uid: 'user_1', phoneNumber: '+911234567890' }, loading: false, signOut: vi.fn() }),
      AuthProvider: ({ children }: { children: React.ReactNode }) => children,
    }));

    const { Header: HeaderWithSignedInAuth } = await import('./Header');
    const { CartProvider: FreshCartProvider } = await import('../../lib/cart-context');

    render(
      <FreshCartProvider>
        <HeaderWithSignedInAuth categories={categories} onCartClick={() => {}} />
      </FreshCartProvider>
    );
    const accountButton = screen.getByLabelText('Account');
    expect(accountButton.tagName).toBe('BUTTON');
    expect(screen.queryByTestId('account-modal')).not.toBeInTheDocument();

    fireEvent.click(accountButton);
    expect(screen.getByTestId('account-modal')).toBeInTheDocument();
    expect(screen.getByText('+911234567890')).toBeInTheDocument();
    expect(screen.queryByLabelText('Sign in')).not.toBeInTheDocument();

    vi.doUnmock('../../lib/auth-context');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- Header.test.tsx`
Expected: FAIL — the signed-in account icon is still a `<Link href="/orders">`, so `getByLabelText('Account').tagName` is `'A'`, not `'BUTTON'`, and clicking it never opens the modal.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/components/layout/Header.tsx`, replace this block:

```tsx
          {user ? (
            <Link href="/orders" aria-label="Account" className="text-charcoal">
              ◐
            </Link>
          ) : (
            <button
              aria-label="Sign in"
              onClick={() => setIsAccountModalOpen(true)}
              className="text-charcoal"
            >
              ◐
            </button>
          )}
```

with:

```tsx
          <button
            aria-label={user ? 'Account' : 'Sign in'}
            onClick={() => setIsAccountModalOpen(true)}
            className="text-charcoal"
          >
            ◐
          </button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- Header.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/layout/Header.tsx apps/web/components/layout/Header.test.tsx
git commit -m "feat(auth): account icon opens AccountModal in both auth states"
```

---

### Task 4: `create-order` writes a `pending_payment` event

**Files:**
- Modify: `apps/web/app/api/checkout/create-order/route.ts`
- Modify: `apps/web/app/api/checkout/create-order/route.test.ts`

**Interfaces:**
- Consumes: `OrderEventSchema` from `@bro-pics/shared` (already defined, unchanged).

- [ ] **Step 1: Write the failing test**

In `apps/web/app/api/checkout/create-order/route.test.ts`, extend the last test (`'creates a Razorpay order and an orders/{id} doc on a fully available cart'`) by adding these assertions right after the existing `writtenOrder` assertion block (after the `expect(writtenOrder).toMatchObject({...})` call, still inside the same `it`):

```ts
    const eventCall = mockBatchSet.mock.calls.find(([, data]) => data.createdBy === 'user_1');
    expect(eventCall).toBeDefined();
    const [, writtenEvent] = eventCall!;
    expect(writtenEvent).toMatchObject({
      status: 'pending_payment',
      note: null,
      courier: null,
      awbNumber: null,
      createdBy: 'user_1',
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- create-order/route.test.ts`
Expected: FAIL — `eventCall` is `undefined`, no batch write has `createdBy: 'user_1'` yet.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/app/api/checkout/create-order/route.ts`, change the import line:

```ts
import { generateOrderNo, OrderSchema, OrderItemSchema, AddressSchema, type CounterTransaction } from '@bro-pics/shared';
```

to:

```ts
import { generateOrderNo, OrderSchema, OrderItemSchema, OrderEventSchema, AddressSchema, type CounterTransaction } from '@bro-pics/shared';
```

Then, right after `batch.set(orderRef, order);` (and before the `for (const line of priced)` loop), add:

```ts
  const eventRef = orderRef.collection('events').doc();
  batch.set(
    eventRef,
    OrderEventSchema.parse({
      id: eventRef.id,
      status: 'pending_payment',
      note: null,
      courier: null,
      awbNumber: null,
      createdAt: new Date().toISOString(),
      createdBy: userId,
    })
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- create-order/route.test.ts`
Expected: PASS (all tests in this file)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/checkout/create-order/route.ts apps/web/app/api/checkout/create-order/route.test.ts
git commit -m "feat(orders): write a pending_payment OrderEvent on order creation"
```

---

### Task 5: Razorpay webhook writes a `paid` event

**Files:**
- Modify: `functions/src/webhooks/razorpay.ts`
- Modify: `functions/src/webhooks/razorpay.test.ts`

**Interfaces:**
- Consumes: `OrderEventSchema`, `type OrderEvent` from `@bro-pics/shared` (already defined, unchanged).
- Produces: `PaymentEventTransaction.recordEvent(orderId: string, event: Omit<OrderEvent, 'id'>): void` — new interface method, used only within this file.

- [ ] **Step 1: Write the failing test**

In `functions/src/webhooks/razorpay.test.ts`, add `recordEvent: vi.fn()` to `makePaymentTx`'s returned object:

```ts
function makePaymentTx(
  order: { id: string; userId: string; status: string } | null
): PaymentEventTransaction {
  return {
    findOrderByRazorpayOrderId: vi.fn().mockResolvedValue(order),
    markPaymentCaptured: vi.fn(),
    markPaymentFailed: vi.fn(),
    clearCart: vi.fn(),
    recordEvent: vi.fn(),
  };
}
```

Add this assertion inside the `'marks the order paid, clears the cart, and records the event as processed'` test, right after the existing `expect(paymentTx.clearCart)...` line:

```ts
    expect(paymentTx.recordEvent).toHaveBeenCalledWith(
      'order_1',
      expect.objectContaining({ status: 'paid', createdBy: 'system' })
    );
```

Add `expect(paymentTx.recordEvent).not.toHaveBeenCalled();` to each of the other three `handlePaymentCaptured` tests (`'does nothing when the event was already processed'`, `'does nothing when no matching order is found'`, `'does nothing when the order is already paid'`) and to all three `handlePaymentFailed` tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/functions test -- razorpay.test.ts`
Expected: FAIL on the `'marks the order paid...'` test — `recordEvent` is never called yet, so `toHaveBeenCalledWith` fails. (The `not.toHaveBeenCalled()` assertions in the other tests pass trivially since `recordEvent` isn't called anywhere yet — that's expected; they exist to stay green after Step 3 too.)

- [ ] **Step 3: Write minimal implementation**

In `functions/src/webhooks/razorpay.ts`, change the top import to add `OrderEventSchema`/`OrderEvent`:

```ts
import { isDuplicateWebhookEvent, markWebhookProcessed, type WebhookTransaction } from './idempotency';
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { OrderEventSchema, type OrderEvent } from '@bro-pics/shared';
```

Extend the `PaymentEventTransaction` interface:

```ts
export interface PaymentEventTransaction {
  findOrderByRazorpayOrderId(
    razorpayOrderId: string
  ): Promise<{ id: string; userId: string; status: string } | null>;
  markPaymentCaptured(orderId: string, razorpayPaymentId: string): void;
  markPaymentFailed(orderId: string): void;
  clearCart(userId: string): void;
  recordEvent(orderId: string, event: Omit<OrderEvent, 'id'>): void;
}
```

In `handlePaymentCaptured`, change:

```ts
  paymentTx.markPaymentCaptured(order.id, params.razorpayPaymentId);
  paymentTx.clearCart(order.userId);
  markWebhookProcessed(webhookTx, params.eventId, order.id);
```

to:

```ts
  paymentTx.markPaymentCaptured(order.id, params.razorpayPaymentId);
  paymentTx.recordEvent(order.id, {
    status: 'paid',
    note: null,
    courier: null,
    awbNumber: null,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
  });
  paymentTx.clearCart(order.userId);
  markWebhookProcessed(webhookTx, params.eventId, order.id);
```

In `buildPaymentTx`, add `recordEvent` to the returned object (after `clearCart`):

```ts
    clearCart(userId) {
      transaction.set(db.collection('carts').doc(userId), { items: [] });
    },
    recordEvent(orderId, event) {
      const eventRef = db.collection('orders').doc(orderId).collection('events').doc();
      transaction.set(eventRef, OrderEventSchema.parse({ ...event, id: eventRef.id }));
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/functions test -- razorpay.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add functions/src/webhooks/razorpay.ts functions/src/webhooks/razorpay.test.ts
git commit -m "feat(orders): write a paid OrderEvent in the Razorpay webhook transaction"
```

---

### Task 6: Order detail page suppresses the synthetic row once a real event exists

**Files:**
- Modify: `apps/web/app/(account)/orders/[orderId]/page.tsx`
- Modify: `apps/web/app/(account)/orders/[orderId]/page.test.tsx`

**Interfaces:**
- Consumes: `OrderEvent` from `@bro-pics/shared` (already imported in this file, unchanged shape).

- [ ] **Step 1: Write the failing test**

Add this test to `apps/web/app/(account)/orders/[orderId]/page.test.tsx`, after the existing `'shows a synthetic "Order placed" row...'` test:

```tsx
  it('suppresses the synthetic "Order placed" row when a real pending_payment event exists', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        orderNo: 'BP-2026-00003',
        status: 'paid',
        total: 50000,
        placedAt: { toDate: () => new Date('2026-09-06T10:00:00.000Z') },
      }),
    });
    mockGetDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({
        docs: [
          {
            data: () => ({
              id: 'evt_1',
              status: 'pending_payment',
              note: null,
              courier: null,
              awbNumber: null,
              createdAt: '2026-09-06T10:00:00.000Z',
            }),
          },
        ],
      });

    render(<OrderDetailPage params={Promise.resolve({ orderId: 'order_3' })} />);

    await screen.findByText('pending_payment');
    expect(screen.queryByText('Order placed')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- "orders/\[orderId\]/page.test.tsx"`
Expected: FAIL — `'Order placed'` still renders unconditionally, so `queryByText('Order placed')` finds it.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/app/(account)/orders/[orderId]/page.tsx`, inside the component body, add this line right after `if (!order) return <p>Loading…</p>;`:

```tsx
  const hasPendingPaymentEvent = events.some((event) => event.status === 'pending_payment');
```

Then change:

```tsx
        <div className="text-sm">
          <span>Order placed</span>
          {order.placedAt !== undefined && <span> — <span>{formatPlacedAt(order.placedAt)}</span></span>}
        </div>
```

to:

```tsx
        {!hasPendingPaymentEvent && (
          <div className="text-sm">
            <span>Order placed</span>
            {order.placedAt !== undefined && <span> — <span>{formatPlacedAt(order.placedAt)}</span></span>}
          </div>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- "orders/\[orderId\]/page.test.tsx"`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(account)/orders/[orderId]/page.tsx" "apps/web/app/(account)/orders/[orderId]/page.test.tsx"
git commit -m "fix(orders): suppress synthetic timeline row once a real pending_payment event exists"
```

---

### Task 7: Full verification and PROJECT_STATUS.md update

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Run the full test suite**

Run: `pnpm -r test`
Expected: every workspace passes, including the six files touched above.

- [ ] **Step 2: Run typecheck across every workspace**

Run: `pnpm -r typecheck`
Expected: clean across all packages (in particular `apps/web` and `functions`, the two touched here).

- [ ] **Step 3: Update `PROJECT_STATUS.md`**

Add a `4d` row to the phase roadmap table (§3) for "Phase 5 Plan A — Sign-out & order timeline completeness", mark it complete and kept on `feature/admin-panel-and-production-queue`. Remove the two now-closed items from §5's known-gaps list: "No sign-out path exists anywhere in the app" and "No `OrderEvent` is ever written for `pending_payment` or `paid`". Update the test count in §4 if it changed.

- [ ] **Step 4: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: record Phase 5 Plan A completion in PROJECT_STATUS.md"
```

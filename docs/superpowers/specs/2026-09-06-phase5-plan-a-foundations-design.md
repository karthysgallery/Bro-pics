# Phase 5, Plan A — Sign-Out & Order Timeline Completeness — Design

**Date:** 2026-09-06
**Status:** Approved by user, ready for implementation planning
**Depends on:** [2026-09-03-accounts-cart-design.md](2026-09-03-accounts-cart-design.md) (Phase 4 Plan A — `AuthContext`, `CartProvider`'s sign-in/sign-out reactivity), [2026-09-04-checkout-razorpay-design.md](2026-09-04-checkout-razorpay-design.md) (Phase 4 Plan B — `create-order` route, `razorpayWebhook`), [2026-09-05-order-tracking-design.md](2026-09-05-order-tracking-design.md) (Phase 4 Plan C — `OrderEventSchema`, the customer order detail page)

## 1. Purpose and scope

Plan A of Phase 5 (Admin Panel & Production Queue), the first of three: two small, independent fixes that unblock the rest of the phase and close two dormant gaps flagged since Phase 4.

Out of scope, deliberately:
- **Admin role-management UI.** Plan B's job.
- **A real staff order queue.** Plan C's job — this plan touches neither `/staff/orders` nor its routes.
- **Any UI for editing account details** (name, email, addresses) beyond viewing the signed-in phone number and signing out. Not requested, not needed to unblock anything else.
- **Backfilling `OrderEvent` docs for orders placed before this fix.** There are currently no real customer orders on the live project (Razorpay has never been live-tested) — nothing to backfill.

## 2. Sign-out

`AuthContextValue` (`apps/web/lib/auth-context.tsx`) gains a `signOut: () => Promise<void>` function, wrapping Firebase Auth's `signOut(auth)`. No extra cleanup logic is needed here: `CartProvider` already reacts to `user` transitioning to `null` (resets `hasReconciledRef`, drops `firestoreItems`, falls back to local-only `items`) — Plan A of Phase 4 built that reactivity for exactly this transition, it has simply never been reachable until now.

`AccountModal.tsx` stops being a sign-in-only modal and branches on `useAuth()`:
- **Signed out** (unchanged): renders `PhoneSignIn`, as today.
- **Signed in**: renders the signed-in phone number (`user.phoneNumber`), a "My Orders" link to `/orders`, and a "Sign Out" button that calls `signOut()` then `onClose()`.

`Header.tsx`'s account icon currently branches into two different behaviors: a `<button>` that opens `AccountModal` when signed out, and a `<Link>` straight to `/orders` when signed in — the modal is simply never reachable once signed in, which is the entire reason no sign-out path has existed anywhere in the app. This plan makes the icon always a `<button>` that opens `AccountModal`, regardless of auth state; the modal itself now handles both states internally (above).

## 3. Order timeline completeness

**Problem:** the design invariant from Plan C ("`orders/{orderId}.status` always mirrors the most recent event's `status`") has never actually held — only the staff advance route (`/api/staff/orders/[orderNo]/advance`) writes an `OrderEvent`. Every order's *first* two statuses, `pending_payment` (set at creation) and `paid` (set by the webhook), happen with no corresponding event. The order detail page works around this by synthesizing a display-only "Order placed" row from `order.placedAt`.

**Fix — two write paths, one read-path adjustment:**

1. **`apps/web/app/api/checkout/create-order/route.ts`**: the existing `batch` that writes `orderRef` and each item gains one more `batch.set` — a `pending_payment` event at `orderRef.collection('events').doc()`, `createdBy` set to the customer's own `userId` (the actor who placed the order).

2. **`functions/src/webhooks/razorpay.ts`**: `PaymentEventTransaction` gains `recordEvent(orderId: string, event: Omit<OrderEvent, 'id'>): void`. `buildPaymentTx`'s implementation creates a fresh doc ref under `orders/{orderId}/events` and `transaction.set`s it — **inside the same transaction** as the `paid` status flip, matching this codebase's established "webhook side-effect and status change commit atomically" pattern (the same shape `markWebhookProcessed` already uses for idempotency). `handlePaymentCaptured` calls `recordEvent` with `status: 'paid'`, `createdBy: 'system'` (there is no human actor behind a webhook delivery). `handlePaymentFailed` does **not** get an event — `paymentStatus` flips to `'failed'` but `order.status` itself never changes on failure, and an `OrderEvent`'s whole purpose is representing a status transition that did not happen here.

3. **`apps/web/app/(account)/orders/[orderId]/page.tsx`**: the synthetic "Order placed" row is now conditional — rendered only when `events` contains no entry with `status === 'pending_payment'`. This keeps any pre-fix legacy order (none currently exist, but the check costs nothing) from showing a blank first row, while every order created after this fix shows a clean, non-duplicated timeline built entirely from real events.

## 4. Error handling

Both new event writes ride inside transactions/batches that already exist and already have error handling (a `create-order` batch failure surfaces as today; a webhook transaction failure is retried by Razorpay's own webhook redelivery, same as before this plan touches it). No new failure mode is introduced — this plan adds a write to an existing atomic unit, it doesn't add a new one.

## 5. Testing

- `lib/auth-context.test.tsx`: `signOut()` calls Firebase's `signOut`, and `user` becomes `null` after.
- `components/layout/AccountModal.test.tsx`: signed-out state still renders `PhoneSignIn`; signed-in state renders phone number, orders link, and a sign-out button that calls `signOut`.
- `functions/src/webhooks/razorpay.test.ts`: extend the fake `PaymentEventTransaction` with `recordEvent`; assert `handlePaymentCaptured` calls it once with `status: 'paid'`/`createdBy: 'system'`, and `handlePaymentFailed` never calls it.
- `apps/web/app/api/checkout/create-order/route.test.ts`: assert the batch includes an events-collection write with `status: 'pending_payment'` and `createdBy` equal to the caller's `userId`.
- `apps/web/app/(account)/orders/[orderId]/page.test.tsx`: extend to cover both branches of the synthetic-row suppression (no `pending_payment` event → synthetic row shown; a real `pending_payment` event present → synthetic row suppressed, only real events render).

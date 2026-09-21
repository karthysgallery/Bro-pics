# Returns/Refunds & Other Round Notes — backend notes

Companion to this round's larger effort (account dashboard, recommendations,
cart/checkout completion, returns/refunds). As with prior rounds, everything
actually built lives entirely in `apps/web` (Next.js API routes using
`firebase-admin`) plus purely additive `packages/shared` schema files — no
`firestore.rules`, `firestore.indexes.json`, `storage.rules`, or `functions/`
changes were needed. The items below are things this round intentionally did
**not** build, or built with a documented limitation, because they need a
real infrastructure or policy decision.

## 1. Refund calls have no idempotency key

`POST /api/staff/returns/[returnId]` calls Razorpay's refund API
(`lib/razorpay-client.ts`'s `createRazorpayRefund`) **before** committing the
Firestore transaction that advances the return to `refunded`. This ordering
is deliberate — an external HTTP call must never sit inside a Firestore
transaction, matching the same rule `create-order`'s Razorpay-order-creation
step already follows. The tradeoff: if two staff requests race (the same
return advanced by two people, or a retried request after a dropped
response) between the Razorpay call and the transaction's own re-validation,
Razorpay could be called twice for the same return before the second call's
Firestore write is rejected as a stale transition.

This is a real gap, not a hidden one — acceptable for now because staff
actions on a single return are low-frequency and low-concurrency (a human
clicking a button, not an automated high-throughput path), but a genuine
production hardening item would be passing Razorpay's own idempotency-key
support (an `X-Payment-Idempotency` style header, check current Razorpay API
docs for the exact mechanism) derived from the return's id, so a retried
call is provably safe rather than merely unlikely to collide.

## 2. Return refund amount is always the full order total

`refundAmount` is set once, at request time, to `order.total` — there is no
partial-refund path (e.g. "customer keeps one frame out of three, refund
only that line"). Building partial refunds needs a real policy decision
(does a partial return also partially restock? does it prorate the coupon
discount and shipping charge across the kept vs. returned items?) that isn't
assumed here. If/when that policy is decided, `refundAmount` becomes
staff-editable at approval time rather than fixed at request time.

## 3. No `salesCount`/trending signal on `Product`

Carried over from the recommendations work this round (`lib/
recommendations.ts`): `getTrendingProducts()` falls back to `ratingCount` +
recency because there's no sales-velocity counter on `Product`. A real
"trending" signal needs a new field, incremented somewhere in the order
pipeline (most naturally alongside the existing `paymentStatus` webhook
handler, when an order actually pays — not at cart-add time, which would
count abandoned carts as "trending" too).

## 4. Frequently-bought-together — not built

Also carried over: this needs either a Firestore `collectionGroup` query
over every order's `items` subcollection (no `collectionGroup` index exists
for `items` today, and this environment can't deploy one) or a denormalized
`productIds: string[]` array on `Order` written at order-creation time. Not
attempted this round rather than shipping something that throws in
production the first time it's called.

## 5. Notifications: in-app only, no webhook-triggered events, no real pagination

The notification system (`lib/notify.ts`, `/api/notifications`, the account
notification center, the header bell) is genuinely event-driven for every
status change that already happens inside `apps/web`: staff order-advance,
customer order-cancel, and staff return-advance (including the terminal
`refunded` transition) all write a notification as a fire-and-forget side
effect after their own Firestore write succeeds. Three real gaps remain,
none of them worked around:

- **No "Order placed" / "Payment confirmed via webhook" / "Payment failed"
  notification.** Those events fire from `functions/src/webhooks/razorpay.ts`,
  which is off-limits this round (frontend-only constraint). `paid` is still
  in `NOTIFICATION_BY_STATUS` in `staff/orders/[orderNo]/advance/route.ts`
  for when staff manually advance an order, but the webhook's own automatic
  `paid` transition (the common case) never calls `writeNotification`. Wiring
  this up needs either a small addition inside `functions/` itself, or the
  webhook handler calling out to a new `apps/web` API route — both outside
  this round's scope.
- **Email/SMS/push are stubbed, not sent.** Confirmed via the repo's env
  config: no SendGrid/SES/Twilio credentials and no Firebase Cloud Messaging
  Web Push setup exist anywhere. `Notification` has no channel field and
  nothing claims to send an email/SMS/push that doesn't actually get sent —
  in-app is the only real channel today.
- **No real pagination.** `/api/notifications` reads the whole
  `users/{uid}/notifications` subcollection, sorts in memory, and caps the
  response at the 50 most recent (same tradeoff as `/api/reviews/mine` —
  avoids a composite index this environment can't deploy). `unreadCount` is
  therefore also only accurate within that 50-item window: a customer with
  more than 50 notifications and unread ones older than the 50 most recent
  would see an undercount. Fine at this app's current scale; a real fix is
  cursor-based pagination plus a denormalized unread counter maintained by
  `writeNotification`/`mark read` instead of computed by scanning.

# Phase 4, Plan B — Checkout + Razorpay — Design

**Date:** 2026-09-04
**Status:** Approved by user, ready for implementation planning
**Depends on:** [2026-08-28-foundation-design.md](2026-08-28-foundation-design.md) (`OrderSchema`, `SettingsSchema`, `CouponSchema`, `generateOrderNo`, webhook idempotency — all originally sketched/built here), [2026-09-03-accounts-cart-design.md](2026-09-03-accounts-cart-design.md) (Phase 4 Plan A — `AddressSchema`, `carts/{userId}`, phone-OTP auth, `userId` ownership on `uploads`/`customizations`)

## 1. Purpose and scope

This is Plan B of Phase 4 (Cart, Checkout, Razorpay, Accounts, Order Tracking): turning a signed-in user's Firestore cart into a paid order via Razorpay. Login is already required before checkout (locked in during Plan A's brainstorm) — this plan does not build a guest-checkout path.

Out of scope, deliberately:
- **Coupons.** `CouponSchema` exists (Foundation) but nothing in this plan applies one — `OrderSchema.discount` stays `0` and `couponId` stays unset for every order this plan creates. No task here reads or validates a coupon code.
- **GST / tax calculation.** `settings.gstEnabled` stays `false`; `OrderSchema.taxLines` is always written as `[]`. Real tax logic activates only once the client has a GSTIN (Foundation decision, unchanged).
- **Partial-COD.** `OrderSchema.paymentMode` is always written as `'prepaid'`, `amountDueOnDelivery` always `0`. The schema already carries these fields for a future COD option (Foundation decision); this plan doesn't build COD logic, just satisfies the existing shape.
- **Order tracking / status timeline UI**, and the `orders/{orderId}/events/{eventId}` subcollection `firestore.rules` already reserves. Plan C's job. This plan only ever writes an order into `pending_payment` and, via the webhook, `paid` — no admin-facing status changes, no customer-facing tracking page.
- **Real shipping rates.** `settings.freeShippingThreshold`/`flatShippingCharge` get real-looking placeholder values (e.g. flat ₹50, free above ₹1500), editable later once the client supplies real numbers — no zone/weight-based calculation.
- **Inventory decrementing.** Stock is enforced as a boolean-ish gate (`variant.stockStatus === 'in_stock'`) at order-creation time, not decremented or reserved. Oversell between two simultaneous checkouts of the last unit is a known, accepted gap — no reservation/locking mechanism this plan.

## 2. Data model additions

### 2.1 New `OrderItemSchema`

Foundation's `firestore.rules` already reserves `orders/{orderId}/items/{itemId}` (read-gated on the parent order's owner/staff), but — same gap pattern as `User`/`Address`/`Upload` before this — no schema was ever built.

```ts
// packages/shared/src/schemas/order-item.ts
{
  id: string,
  productId: string,       // denormalized for display, avoids a join at fulfillment time
  variantId: string,
  personalizationId: string,
  title: string,           // snapshotted display title, e.g. "Classic Wooden Frame — 8x12 in"
  unitPrice: number,        // paise, server-derived from variant.price AT ORDER TIME — never from the cart's unitPriceSnapshot
  qty: number,
  previewUrl: string | null,
}
```

One doc per cart line, written once at order creation, never mutated afterward — an order item is a receipt, not a live view of the product.

### 2.2 `OrderSchema` gains a money-invariant self-check

```ts
// packages/shared/src/schemas/order.ts
export const OrderSchema = z.object({ /* unchanged fields */ }).superRefine((order, ctx) => {
  if (order.subtotal - order.discount + order.shipping !== order.total) {
    ctx.addIssue({ code: 'custom', message: 'subtotal - discount + shipping must equal total' });
  }
  if (order.amountPaidOnline + order.amountDueOnDelivery !== order.total) {
    ctx.addIssue({ code: 'custom', message: 'amountPaidOnline + amountDueOnDelivery must equal total' });
  }
});
```

No field changes — this closes the gap PROJECT_STATUS.md has tracked since Foundation: a malformed order (money that doesn't add up) can no longer be constructed, by any future code, ever again. `addressJson` (already `z.record(z.string(), z.unknown())`) is reused as-is for the snapshotted delivery address — no schema change needed there.

### 2.3 `uploads`/`customizations` gain `userId` at write time, not only at reconciliation

`/api/uploads` and `/api/customizations` (Phase 3, unchanged since) currently only ever accept an `X-Session-Id` header. Both routes gain an additional, optional check: if the request also carries `Authorization: Bearer <idToken>`, the server verifies it via the Admin SDK and sets `userId` on the created doc directly — no longer solely dependent on a later `reconcileSessionOnLogin` pass, which only ever fires once, at the moment of sign-in. `sessionId` is still always set (from the header), preserving the existing pre-login flow exactly. Signed-out requests (no `Authorization` header) behave identically to today.

This closes the tracked gap: any personalization made by an already-signed-in user gets `userId` immediately, and can be read by its own owner client-side under the existing `isOwner(resource.data.userId)` rule — no rule change needed, the rule was already written for this, just never reachable outside the reconciliation path.

## 3. Address collection

A checkout-time form component writes to `users/{uid}/addresses/{addressId}` — already owner-writable per Plan A's `firestore.rules` (`isOwner(userId)`), so this is a direct client write, no server route needed. Returning customers seeing a non-empty `addresses` subcollection get a picker (defaulting to the doc with `isDefault: true`, or the first one if none is marked default) with an "add new address" option that reveals the same form. No standalone address-management page this plan — editing/deleting a saved address only happens inline at checkout.

The address actually used for an order is **snapshotted** into `orders/{orderId}.addressJson` at order-creation time (a plain copy of the `Address` object's fields), not a live reference to the `addresses/{addressId}` doc — so a customer editing or deleting a saved address later never retroactively changes a past order's shipping details.

## 4. Server-side order creation

New route: `POST /api/checkout/create-order`, Admin-SDK-backed, following the same pattern as `/api/uploads`/`/api/customizations` (a Next.js API route, not a Cloud Function `onCall` — keeps checkout logic in the same place as the rest of this project's Admin-SDK business logic; `functions/` stays reserved for triggers, webhooks, and scheduled work).

Request: `{ addressId: string }` (the chosen/just-saved address's id) plus the caller's `Authorization: Bearer <idToken>` (required — this route only works for a signed-in user, matching the "login required before checkout" decision).

Server steps, in order:
1. Verify the ID token via Admin SDK, extract `userId`.
2. Read `carts/{userId}`. If empty, `400`.
3. Read `users/{userId}/addresses/{addressId}`. If missing or not owned by this user, `400`.
4. For each cart line, look up `products/{productId}/variants/{variantId}` and re-derive `unitPrice` from `variant.price` — **the cart's `unitPriceSnapshot` is never read for money, only for display before this point.** If any variant is missing, inactive, or `stockStatus !== 'in_stock'`, collect it and return `409` listing every unavailable line (not just the first) so the client can show a clear, complete error rather than a frustrating one-at-a-time retry loop.
5. Compute `subtotal` (sum of `unitPrice * qty`), `shipping` (flat charge unless `subtotal >= freeShippingThreshold`), `discount: 0`, `total = subtotal - discount + shipping`. The two shipping numbers come from a new `settings/shipping` document (`{freeShippingThreshold: number, flatShippingCharge: number}`, both paise) — following this codebase's existing per-key settings pattern (`apps/web/lib/firestore-settings.ts`'s `getAnnouncementBarSettings()` already reads `settings/announcementBar` the same way; `SettingsSchema`'s single-document shape in `packages/shared/src/schemas/settings.ts` was never actually how settings got stored, and this plan follows the real precedent, not the unused schema). If the doc doesn't exist yet (nothing seeds it today), fall back to hardcoded placeholder constants (flat ₹50 / free above ₹1500) rather than failing checkout.
6. Generate the order number via the existing `generateOrderNo(tx, year)` (Foundation, reused unchanged), run in its own short transaction that does nothing but increment the counter — this commits and returns before the next step.
7. Create the Razorpay Order via their Orders API (`amount: total` in paise, `currency: 'INR'`, `receipt: orderNo`). Deliberately **outside** any Firestore transaction — an external HTTP call inside a Firestore transaction is unsafe (transactions can retry on contention, and Razorpay's API isn't safely repeatable), so this step runs after step 6 has already committed, using the order number it returned.
8. Write `orders/{id}` (`status: 'pending_payment'`, `paymentStatus: 'pending'`, `paymentMode: 'prepaid'`, `amountPaidOnline: total`, `amountDueOnDelivery: 0`, `taxLines: []`, the computed money fields, `addressJson` from step 3, `razorpayOrderId` from step 7, `placedAt: now`) and one `orders/{id}/items/{itemId}` doc per cart line (§2.1's shape, using the re-derived `unitPrice`) as a single batch — a plain batch, not a transaction, since these are fresh writes with a brand-new `orderId` and nothing else can be contending for it.
9. Return `{ orderId, razorpayOrderId, amount: total, keyId: <public Razorpay key id> }` to the client.

If step 7 (the Razorpay API call) fails after step 6 has already committed a new order number, that order number is simply never used — `generateOrderNo`'s counter has no rollback, so a gap in the sequence (`BP-2026-00042` skipped, `00043` used) is possible and accepted, not a bug to fix here.

The client then opens Razorpay's Checkout.js modal with these values. Card/UPI/etc. data goes directly to Razorpay — it never touches our servers, so this plan carries no PCI compliance burden. The checkout page subscribes to `orders/{id}` via `onSnapshot` (already owner-readable per Foundation's existing `firestore.rules`) to detect the status flip to `paid` and show a confirmation — it does **not** trust the Checkout.js success callback alone, per Foundation's "webhook is source of truth" decision. The cart (`carts/{userId}`) is left untouched until the webhook confirms payment (§5) — a failed or abandoned payment leaves the cart exactly as it was, ready to retry.

**Manual setup step, like earlier phases' Console checkpoints:** this plan needs a Razorpay account with **test-mode** API keys (`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`) and a webhook secret — obtainable via a free Razorpay signup, no KYC required for test mode (KYC is only needed later for live-mode/real money, which is still blocked on the client per the open items list). These go into `apps/web/.env.local` (the public key id also needs a `NEXT_PUBLIC_` variant for the Checkout.js client script) and `functions/`'s environment.

## 5. Razorpay webhook

New file: `functions/src/webhooks/razorpay.ts`, an HTTPS Cloud Function (`onRequest`, since Razorpay POSTs directly, not via the client SDK).

1. Verify the request signature against `RAZORPAY_WEBHOOK_SECRET` using Razorpay's documented HMAC-SHA256 scheme (`X-Razorpay-Signature` header over the raw request body). Reject with `400` on mismatch — never process an unverified payload.
2. Parse the event. Handle two event types this plan cares about:
   - **`payment.captured`**: inside one Firestore transaction — call the existing `isDuplicateWebhookEvent(tx, eventId)` (Foundation, unchanged); if already processed, return `200` immediately (idempotent no-op, matching the pattern `reconcileSessionOnLogin` already established for its own idempotency). Otherwise, find the order by `razorpayOrderId` (from the event payload), set `status: 'paid'`, `paymentStatus: 'paid'`, `razorpayPaymentId` (from the payload), call `markWebhookProcessed(tx, eventId, orderId)`, and clear `carts/{userId}` (set `{ items: [] }`) — this is the one and only place a cart gets cleared in this plan.
   - **`payment.failed`**: set `paymentStatus: 'failed'` on the matching order (status stays `pending_payment`, cart untouched — the customer can retry from the checkout page, which will call `/api/checkout/create-order` again and get a fresh Razorpay order).
3. Any other event type: acknowledge with `200` and do nothing (Razorpay retries on non-2xx, so an unhandled-but-acknowledged event type must not look like a failure).

## 6. Testing

Unit tests cover: `OrderItemSchema` validation; `OrderSchema`'s new money-invariant `superRefine` (both valid and each of the two ways it can be violated); the shipping-calculation and price-re-derivation pure logic inside `/api/checkout/create-order` (extracted as a testable function, not buried in the route handler, matching this project's established pattern of pure-function-plus-thin-glue); the webhook's signature verification and both event-type branches (using fake transactions, the same pattern `orderNumber.test.ts`/`idempotency.test.ts` already use); and the `userId`-at-write-time addition to `/api/uploads`/`/api/customizations` (a valid token sets `userId`, an invalid/missing one behaves exactly as before). Live verification (an actual Razorpay test-mode payment, confirming the webhook fires and flips the order) happens the same way Plan A's did — a deferred, explicitly-flagged final task, not assumed to work from unit tests alone, since this is exactly the class of cross-system integration (our server, Razorpay, a webhook callback) no mock can fully prove.

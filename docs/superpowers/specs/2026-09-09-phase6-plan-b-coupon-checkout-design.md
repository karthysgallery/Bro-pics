# Phase 6, Plan B — Coupon Application at Checkout — Design

**Date:** 2026-09-09
**Status:** Approved by user (continuous-execution directive), ready for implementation planning
**Depends on:** `packages/shared/src/pricing/coupon.ts`/`schemas/coupon.ts` (Foundation, math-only, never wired to a UI or API route), `apps/web/app/api/checkout/create-order/route.ts` (Phase 4 Plan B)

## 1. Purpose and scope

`calculateCouponDiscount` and `CouponSchema` have existed since Foundation as pure discount math, fully unit-tested, but nothing in the app ever calls them — `create-order/route.ts` hardcodes `const discount = 0;`, the checkout page has no coupon input, no `coupons` Firestore collection has ever been written to, and the homepage's own marketing banner ("Use code NEW10 for 10% off your first order") has no coupon behind it. This plan wires the existing math into a real checkout flow: a coupon-code input on the checkout page, a validation route that previews the discount before payment, real discount application in `create-order`, and seed data so `NEW10` actually works.

Out of scope, deliberately:
- **`appliesTo: 'category' | 'product'` restriction enforcement.** `CouponSchema` declares this enum but carries no `categoryId`/`productId` field to restrict against — the schema itself doesn't have enough data to enforce a scoped coupon. This plan only builds and seeds `appliesTo: 'all'` coupons; category/product-scoped coupons remain unimplementable until the schema grows a target field, which is a schema-design decision, not this plan's to make unilaterally.
- **`perUserLimit` enforcement via a new tracking structure.** Enforced via a simple check (count the user's own past orders carrying this `couponCode`) rather than a new subcollection or counter doc — see §3. If this proves too coarse later (e.g. counting cancelled/refunded orders), that's a follow-up, not blocking this plan.
- **A coupon-management admin UI.** Coupons are seeded directly (§5) and, if the business needs to create more later, that's manual Firestore console editing for now — same "admin bootstrap gap" class already documented in PROJECT_STATUS.md for the first admin role grant. Building a `/admin/coupons` CRUD UI is a real feature, not a checkout plan's job.
- **Removing/replacing an applied coupon mid-checkout with a different code.** The UI supports applying one coupon and clearing it (typing a new code re-validates from scratch); no "stack two coupons" or partial-removal flow.

## 2. New route: `POST /api/checkout/coupon/validate`

Signed-in only (`getUserIdFromAuthHeader` — matches `create-order`'s auth tier). Body: `{ code: string }`. `401` signed-out, `400` missing/blank code.

Looks up `coupons/{code}` directly by doc ID (matches `firestore.rules`' `match /coupons/{code}` path shape — the code IS the doc id, not a queried field). `404` if the doc doesn't exist. Converts Firestore Timestamps on `startsAt`/`endsAt` to `Date` before `CouponSchema.parse(...)` (the same Timestamp-vs-Date gotcha this project has hit repeatedly since Storefront Plan A — see PROJECT_STATUS.md §5).

Recomputes the caller's current cart subtotal server-side (reusing `apps/web/lib/checkout-calc.ts`'s existing `calculateSubtotal`/variant-pricing path from `create-order`'s own logic — never trust a subtotal the client sends) and calls `calculateCouponDiscount(subtotal, coupon)`.

**`perUserLimit` check** (not handled by the pure pricing function): if `coupon.perUserLimit` is set, count the caller's own past orders (`orders` where `userId == callerId && couponCode == code`) and reject with `reason: 'per_user_limit_reached'` if the count is `>= perUserLimit`. This mirrors `calculateCouponDiscount`'s own `CouponApplicationResult.reason` union — the route extends that union with this one route-level reason the pure function can't know about (it only sees usage counts, not per-user history).

Returns `200 { valid: true, discountPaise, freeShipping: coupon.type === 'free_ship' }` or `200 { valid: false, reason }` — a structurally invalid/unknown code is a normal "not applicable" response, not an error status, matching how a real checkout UI should treat "coupon doesn't work" (distinct from `401`/`400`, which mean the *request itself* was malformed).

This route does **not** mutate anything (no `usedCount` increment) — it's a preview. The increment happens only on a successful order (§3), since a coupon looked up here might never be paid for.

## 3. `create-order` route changes

`apps/web/app/api/checkout/create-order/route.ts` gains an optional `couponCode` field in its request body, parsed alongside the existing `addressId` (same manual-presence-check style already used there).

If present, re-validates the coupon **again**, from scratch, server-side — the same lookup + `calculateCouponDiscount` + `perUserLimit` check as §2's route, not trusting whatever the client claims the discount is (the validate route is a preview for UI purposes only; a malicious or stale client could otherwise POST a fabricated discount). If the coupon is invalid at this point (expired between preview and checkout, usage limit hit by someone else in the meantime, etc.), the order still proceeds — **not** as a hard failure — with `discount: 0` and no coupon recorded, since blocking checkout entirely over a coupon race is worse UX than silently not applying it. (This mirrors the project's existing accepted-race philosophy — see the order-number-sequence gap and the create-order-after-Razorpay-success gap already in PROJECT_STATUS.md §5 — rather than introducing new blocking-transaction machinery for a non-critical-path concern.)

`discount` (currently hardcoded `0`) becomes the real `calculateCouponDiscount(...).discountPaise` when a coupon validated successfully, else `0` — unchanged shape, just no longer hardcoded.

**`free_ship` coupons**: `calculateCouponDiscount` deliberately returns `discountPaise: 0` for this type (its own code comments: "free_ship discount is applied to shipping, not subtotal"). This route is the one place that actually applies it: when a valid `free_ship` coupon is present, `shipping` (already computed via `calculateShipping`) is set to `0` before computing `total`, instead of touching `discount`.

**Order schema gains a field**: `OrderSchema` (`packages/shared/src/schemas/order.ts`) gets `couponCode: z.string().optional()`, written when a coupon successfully applied — needed both to display "Coupon NEW10 applied" on the order confirmation/history pages later (out of scope to build that display in this plan, but the data should exist for it) and for §2's `perUserLimit` check to have something to count against.

**`usedCount` increment**: on successful order creation with a validated coupon, the existing `batch` (order + event + items writes) gains one more write: `batch.update(db.collection('coupons').doc(couponCode), { usedCount: FieldValue.increment(1) })`. This is a plain batch write, not inside the order-number transaction (which must stay Razorpay-call-free per the existing Step 1/Step 2/Step 3 split) — so there's a narrow window between the `perUserLimit`/usage check and this increment where concurrent checkouts could both pass a `usageLimit` check and both increment, letting the limit be exceeded by a small margin under real concurrency. **Accepted gap**, same class as the two races already documented in PROJECT_STATUS.md §5 — worth a comment in the code, not worth blocking this plan on transactional machinery for a coupon-usage-count edge case that costs the business a slightly-over-redeemed promo, not money-losing order-total corruption (the discount amount itself is still always correctly bounded per-order by `calculateCouponDiscount`'s own clamping).

## 4. `/checkout` page — coupon UI

New section between the existing item list and the "Place order" button: a text input + "Apply" button. On Apply, calls §2's validate route. On `valid: true`: shows "Coupon `<CODE>` applied — ₹X off" (or "free shipping" for `free_ship`), stores `couponCode` in component state, disables the input (re-enable via a "Remove" link that clears the state and re-enables it). On `valid: false`: shows the `reason` as a short human message (a small `reason → message` map: `below_min_order` → "Minimum order not met", `expired`/`not_started` → "This coupon isn't active right now", `usage_limit_reached`/`per_user_limit_reached` → "This coupon has reached its usage limit"). On `404`: "Invalid coupon code."

When placing the order, the stored `couponCode` (if any) is included in the existing POST body to `create-order` alongside `addressId`.

The page currently shows only an itemized list + a Subtotal row (no shipping/discount/total display pre-payment — those are server-computed and only surface in the `amount` returned by `create-order`). This plan does **not** add a full pre-payment price breakdown (shipping/discount/total rows) — that's a separate, larger UI change outside a coupon plan's scope — it only adds the coupon input and its own applied/discount feedback line, reusing the page's existing minimal-breakdown pattern rather than expanding it.

## 5. Seed data: make `NEW10` real

`scripts/seed/src/data.ts` gains one seed coupon object (new `seedCoupons: Coupon[]` array, following the existing `seedReviews`/`seedFrameTemplates` array pattern) and `scripts/seed/src/write-to-firestore.ts` gains the corresponding write step (`stage(db.collection('coupons').doc(coupon.code), coupon)`) — the same "computed but never staged" bug class Phase 4's verification pass already caught once for `seedFrameTemplates`, so this plan writes the staging call in the same commit as the data, not as an afterthought.

`NEW10`: `type: 'percent'`, `value: 10`, no `minOrder`, no `maxDiscountCap`, `startsAt` far in the past, `endsAt` far in the future, no `usageLimit`/`perUserLimit`, `appliesTo: 'all'`, `usedCount: 0` — matching the homepage banner's existing claim exactly ("10% off your first order" — note: this plan does NOT enforce "first order only"; `perUserLimit` isn't set on this seed coupon since there's no single clean mapping from "first order" to the generic `perUserLimit` mechanism without more product decisions than this plan should make unilaterally, so `NEW10` is seeded as a repeatable 10%-off code for now, closing the "banner refers to nothing" gap without overclaiming a restriction the banner's copy technically implies but this plan isn't scoped to build).

## 6. Testing

- `POST /api/checkout/coupon/validate`: `401` signed-out, `400` missing code, `404` unknown code, `200 valid:true` with correct `discountPaise` for a percent/flat coupon, `200 valid:false` for each `calculateCouponDiscount` rejection reason plus the route-level `per_user_limit_reached` case, `freeShipping: true` for a `free_ship` type coupon.
- `create-order` changes: existing tests continue to pass with `discount: 0`/no `couponCode` when none is sent (backward compatible); new cases — a valid coupon reduces `total` correctly and writes `couponCode` onto the order, a `free_ship` coupon zeroes `shipping` and leaves `discount: 0`, a coupon that fails re-validation at order time doesn't block the order (proceeds with `discount: 0`), `usedCount` increment call is asserted in the batch mock.
- Checkout page: coupon input renders; Apply calls the validate route and shows the discount line on success; shows the mapped reason message on `valid:false`; Remove clears state; Place order's POST body includes `couponCode` when one is applied, omits it when none is.
- Seed: `scripts/seed/src/data.test.ts` already tests every other seed array this way (`describe('seed X', ...)`, asserting each entry parses against its schema, plus a minimum-count check) — `seedCoupons` gets the identical treatment: every entry parses against `CouponSchema`, and `NEW10` specifically exists with `type: 'percent'`, `value: 10`.

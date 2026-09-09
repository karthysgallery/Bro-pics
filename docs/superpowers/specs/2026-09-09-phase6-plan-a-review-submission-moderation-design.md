# Phase 6, Plan A — Review Submission & Moderation — Design

**Date:** 2026-09-09
**Status:** Approved by user (continuous-execution directive), ready for implementation planning
**Depends on:** `packages/shared/src/schemas/review.ts` (Foundation), `apps/web/lib/verify-id-token.ts` (Phase 4/5 auth helpers), `apps/web/lib/order-lookup.ts` (Phase 4 Plan C / Phase 5 Plan C)

## 1. Purpose and scope

`ReviewSchema` and `ReviewsSection`/`ReviewsTestimonials` have existed since Foundation, but there has never been a way for a customer to actually submit a review, or for staff to approve/reject one. `reviews` is a top-level Firestore collection with `allow write: if false` in `firestore.rules` (confirmed) — all writes to it must go through server-side Admin SDK routes. This plan builds that missing write path end to end: submission, moderation, and the denormalized `Product.ratingAverage`/`ratingCount` sync that approval must trigger.

Out of scope, deliberately:
- **Review media upload.** `ReviewSchema.media: string[]` stays writable-but-unused by this plan — submitting photo/video with a review reuses Phase 3's upload pipeline and is a separate follow-up, not blocking here.
- **Editing or deleting a submitted review**, by the customer or staff. Once submitted, only staff moderation (approve/reject) changes it.
- **Notifying the customer when their review is moderated.** No email/SMS integration exists in this project; out of scope everywhere it would apply.
- **Rate-limiting or spam prevention** beyond the one-review-per-user-per-product guard in §2.

## 2. New route: `POST /api/reviews` (submission)

Any signed-in user (`getUserIdFromAuthHeader` — same tier as checkout, not staff-gated). `401` if not signed in.

Body: `{ productId: string, rating: number, title: string, body: string }`. Manual presence/shape checks first (matching `create-order`'s house style — cheap 400s before touching Firestore), then `rating` must be an integer 1-5.

**Duplicate guard:** query `reviews` where `userId == callerUserId && productId == productId`, `limit(1)`. If a doc already exists (any status — pending, approved, or rejected), return `409 { error: 'You have already reviewed this product' }`. One review per user per product, ever.

**Verified-purchase check (new helper, `apps/web/lib/order-lookup.ts`):**
```ts
export async function findVerifiedPurchase(
  db: Firestore,
  userId: string,
  productId: string
): Promise<{ orderId: string } | null>
```
Queries `orders` where `userId == userId` (all statuses — a placed order counts as a purchase for review-eligibility purposes, matching how most storefronts treat this; not gated on `delivered` since this project has no delivery-confirmation event distinct from the staff-set `delivered` status, and requiring it would strand every reviewer behind a staff action that may never happen for orders placed before Phase 6). For each matching order (there can be several), checks `orders/{orderId}/items` for a doc with `productId == productId`. Returns the first match's `orderId`, or `null`. Mirrors `firestore.rules`' ownership shape (`orders/{orderId}` gated by `userId`, `items` gated by parent) but re-implemented server-side since Admin SDK bypasses rules.

Review is not rejected if unverified — `isVerified: false, orderId: undefined` — the schema already supports unverified reviews (`orderId` is optional) and this project doesn't want to block that.

Write: `ReviewSchema.parse({ id: reviewRef.id, productId, userId: callerUserId, orderId, rating, title, body, media: [], isVerified, status: 'pending', createdAt: new Date() })` then `reviewRef.set(...)`. Returns `200 { id, status: 'pending' }`.

## 3. New route: `POST /api/staff/reviews/[id]/moderate`

Staff-or-admin gated (`getStaffUserIdFromAuthHeader`, `403` otherwise — matches `/api/staff/orders`' sensitivity, not admin-only). Body: `{ action: 'approve' | 'reject' }`, `400` on anything else. `404` if the review doc doesn't exist. `409` if the review's current `status` isn't `pending` (moderation is a one-shot action, not re-triggerable — matches `isValidStatusTransition`'s spirit of rejecting nonsensical re-transitions, though this is a simpler binary check, not the order-status state machine).

On `approve`: `reviewRef.update({ status: 'approved' })`. Does **not** touch `Product.ratingAverage`/`ratingCount` directly — see §4, that sync is a Cloud Function trigger, matching this project's established denormalization pattern (`functions/src/products/denormalize.ts`), not inline logic in the API route.

On `reject`: `reviewRef.update({ status: 'rejected' })`. No product-side effect.

## 4. New Cloud Function trigger: `onReviewWritten`

`functions/src/products/denormalize-ratings.ts`, `onDocumentWritten('reviews/{reviewId}', ...)` — mirrors `onVariantWritten`'s exact shape (a pure `calculateRatingFields` function, unit-tested directly; a thin trigger wrapper around it, not unit-tested directly, same reasoning as the existing trigger's docblock).

Fires on every write to any review doc. Reads `productId` off `event.data.after` (falls back to `event.data.before` if the doc was deleted — not expected in this plan's scope, but matches the trigger's own defensive shape). Re-queries `reviews` where `productId == productId && status == 'approved'`, computes `{ ratingAverage: average of rating across that set (0 if none), ratingCount: that set's size }`, writes onto `products/{productId}` via `set(..., { merge: true })` (same not-yet-existing-parent defensiveness as the existing trigger).

Firing on every write (not just approve) is deliberate: a submission (`pending`) or rejection doesn't change the approved set, so the recompute is a no-op write in those cases, but it keeps the trigger's logic uniform and matches the existing trigger's "recompute the whole aggregate from source of truth" philosophy rather than trying to incrementally patch counts (which risks drift the way this project's earlier order-total-self-validation gap did).

## 5. `/staff/reviews` — new moderation queue page

New page, `apps/web/app/staff/reviews/page.tsx`, staff-or-admin client-gated the same way `/staff/orders/page.tsx` is (including the `loading`-flag 3-part fix already established for the auth-flash pattern — apply it from the start here, not as a follow-up fix).

Fetches pending reviews via a new `GET /api/staff/reviews?status=pending` route (staff-or-admin gated, same shape as `GET /api/staff/orders?status=`, reusing the existing `OrderStatusSchema`-style validation pattern but against `ReviewStatusSchema`). Renders each as a card: product title (needs a lookup — see below), rating, title, body, verified-purchase badge if `isVerified`, Approve / Reject buttons calling §3's route. On success, removes the row from the local list (optimistic — matches `/staff/orders`' queue-row-click-to-populate pattern of trusting the just-completed action rather than re-fetching).

**Product title lookup:** the review doc only has `productId`, not a title. Rather than a second round-trip per row, `GET /api/staff/reviews` batches a `products` lookup for the distinct `productId`s in the result set (`Promise.all` of `db.collection('products').doc(id).get()`) and returns `{ reviews: [{..., productTitle }] }`. Matches `GET /api/staff/orders`' choice to embed `addressJson` rather than make the page do a second fetch per row.

## 6. `/product/[slug]` — submission UI

New client component `apps/web/components/product/ReviewForm.tsx`, rendered inside `ReviewsSection` (which gains a new optional-but-always-passed prop, `productId: string`, since the form needs it and `ReviewsSection` is otherwise a pure server-rendered display component receiving `product`/`reviews` as-is — no change to its existing read path).

Signed-out: shows "Sign in to write a review" (reuses the existing `AccountModal` open pattern from `Header.tsx`, not a redirect).
Signed-in: rating (1-5 star `<select>` or click-stars — implementer's call, keep it simple), title, body, Submit. On `409` (already reviewed): show "You've already reviewed this product" and hide the form. On success: replace the form with "Thanks — your review is awaiting approval." (Doesn't optimistically render the new review in the list below, since unapproved reviews are correctly excluded from `getProductBySlug`'s `status == 'approved'` query — showing it locally-only would misrepresent what other visitors see.)

## 7. Testing

- `findVerifiedPurchase`: unit tests with a fake Firestore query (matches `order-lookup.test.ts`'s established mock style) — verified when an order+item match exists, `null` when no order, `null` when an order exists but no item matches that `productId`.
- `POST /api/reviews`: `401` signed-out, `400` missing/invalid fields, `409` duplicate, `200` with `isVerified: true` when a matching order exists, `200` with `isVerified: false` when it doesn't.
- `POST /api/staff/reviews/[id]/moderate`: `403` non-staff, `404` unknown id, `409` non-pending, `200` approve, `200` reject.
- `GET /api/staff/reviews`: `403` non-staff, `200` with `productTitle` populated correctly for a batch of reviews across multiple products.
- `calculateRatingFields` (the pure function inside the new trigger): unit-tested directly — empty set → `{0, 0}`, mixed ratings → correct average (rounding behavior explicit in the test), matches `calculateDenormalizedFields`'s existing test-coverage shape.
- `ReviewForm`: renders sign-in prompt when signed out; submits and shows the pending-confirmation message; shows the duplicate message on a `409` response.
- `/staff/reviews` page: pending queue renders; clicking Approve/Reject calls the route and removes the row from the list.

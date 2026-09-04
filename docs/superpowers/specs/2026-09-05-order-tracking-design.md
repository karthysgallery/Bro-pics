# Phase 4, Plan C — Order Tracking — Design

**Date:** 2026-09-05
**Status:** Approved by user, ready for implementation planning
**Depends on:** [2026-08-28-foundation-design.md](2026-08-28-foundation-design.md) (`OrderStatusSchema`, `firestore.rules`' `orders/{orderId}/events/{eventId}` reservation, `isStaffOrAdmin()` helper — all originally sketched/built here, none ever used until now), [2026-09-04-checkout-razorpay-design.md](2026-09-04-checkout-razorpay-design.md) (Phase 4 Plan B — `OrderSchema`, `OrderItemSchema`, the live `orders/{orderId}` write path)

## 1. Purpose and scope

This is Plan C of Phase 4 (Cart, Checkout, Razorpay, Accounts, Order Tracking), the third and final plan: a manual AWB/status-timeline system (Foundation's locked-in courier decision — no Shiprocket/Nimbus integration at launch) plus the customer-facing order history/tracking page that replaces the current `(account)/orders` stub.

Out of scope, deliberately:
- **A staff order list/production queue.** Phase 5 (Admin Panel & Production Queue)'s job. Plan C's staff UI looks up exactly one order at a time, by order number — it is not a dashboard.
- **Courier API integration** (Shiprocket, Nimbus, etc.). Foundation decision, unchanged — AWB numbers are typed in by hand.
- **Role management UI.** Granting the `admin`/`staff` custom claim is a one-time manual script (§6), not an app feature. Building a UI to manage roles is Phase 5's job.
- **Editing/correcting a past `OrderEvent`.** The event timeline is append-only — a mistake gets corrected by adding a new event (e.g. a `note`-only correction), never by editing or deleting history.
- **Customer-initiated actions** (cancel, request replacement). This plan is read-only for customers — they see the timeline, they don't drive it.

## 2. Data model

### 2.1 New `OrderEventSchema`

`firestore.rules` has reserved `orders/{orderId}/events/{eventId}` since Foundation (owner-or-staff read, `write: if false`), but no schema and no writer have ever existed — the same gap pattern this project has hit repeatedly (`User`, `Address`, `OrderItem` were all in this exact state before their own phases built them).

```ts
// packages/shared/src/schemas/order-event.ts
{
  id: string,
  status: OrderStatusSchema,        // the status this event transitioned the order TO
  note: string | null,
  courier: string | null,           // set only on the event that transitions to 'shipped'
  awbNumber: string | null,         // set only on the event that transitions to 'shipped'
  createdAt: string,                // ISO
  createdBy: string,                // uid of the staff/admin account that made this change
}
```

One doc per status change, written once, never mutated. `orders/{orderId}.status` always mirrors the most recent event's `status` — the event subcollection is the durable history, the order doc's `status` field is the current-state cache everything else already reads.

### 2.2 `OrderSchema` gains `courier`/`awbNumber`

```ts
// packages/shared/src/schemas/order.ts — add two optional fields
courier: z.string().optional(),
awbNumber: z.string().optional(),
```

Both unset until the order transitions to `shipped`; both permanent afterward (this plan doesn't build editing them independently — see §1's exclusions).

## 3. Status-transition validation

A pure function, `isValidStatusTransition(from: OrderStatus, to: OrderStatus): boolean`, encodes the allowed graph:

- Happy path: `pending_payment → paid → in_production → printed_packed → shipped → delivered`, each only reachable from its immediate predecessor.
- Exception branches: `cancelled` is reachable from `pending_payment`, `paid`, or `in_production` (not once shipped — a shipped order that fails gets `replacement_issued` or `refunded`, not silently "cancelled"). `refunded` is reachable from any of `paid`/`in_production`/`printed_packed`/`shipped`/`delivered`. `replacement_issued` is reachable from `shipped` or `delivered`.
- `cancelled`, `refunded`, `replacement_issued` are terminal — no transition out of them (a mis-issued refund gets corrected by a human process outside this system, not by the app pretending to undo it).

This function is the single place transition rules live — both the staff-advance route (§4) and its tests reference it, so the rules can't drift between "what the UI offers" and "what the server accepts."

## 4. Staff order-advance action

### 4.1 Authorization helper

New `getStaffUserIdFromAuthHeader(request): Promise<string | null>`, alongside the existing `getUserIdFromAuthHeader` in `apps/web/lib/verify-id-token.ts` — decodes the same `Authorization: Bearer <idToken>` header, but additionally checks the decoded token's `role` claim is `'admin'` or `'staff'` (mirroring `firestore.rules`' `isStaffOrAdmin()` exactly), returning `null` if the token is invalid, missing, or the role doesn't match. A `null` here always means the caller gets a `403`, never a silent "proceed without" fallback — unlike the optional-auth pattern `getUserIdFromAuthHeader` established in Plan B, this helper's whole purpose is gating a privileged action.

### 4.2 `POST /api/staff/orders/[orderNo]/advance`

Admin-SDK route, following this project's established route pattern (Next.js API route, not a Cloud Function — same reasoning as Plan B's checkout route: this project's convention keeps Admin-SDK business logic in `apps/web/app/api/*`, `functions/` stays reserved for triggers/webhooks/scheduled work).

1. `getStaffUserIdFromAuthHeader(request)` — `403` if not staff/admin.
2. Look up the order by `orderNo` (a `where('orderNo', '==', ...)` query, single-field, no composite index needed — same pattern `create-order`'s webhook counterpart uses for `razorpayOrderId`). `404` if not found.
3. Request body: `{status, note?}`, plus `{courier, awbNumber}` REQUIRED when `status === 'shipped'` (`400` if missing).
4. `isValidStatusTransition(order.status, status)` — `400` with a clear message if the transition isn't allowed.
5. In one transaction: write the new `orders/{orderId}/events/{eventId}` doc (§2.1), update `orders/{orderId}.status` (and `courier`/`awbNumber` when shipping).
6. Return the updated order.

### 4.3 `GET /api/staff/orders/[orderNo]`

The lookup counterpart §5's UI needs before it can show anything to advance. Same staff-only gate as §4.2 (`getStaffUserIdFromAuthHeader`, `403` if not staff/admin), same order-by-`orderNo` lookup (`404` if not found), returns the order plus its line items (`orders/{orderId}/items`) so the staff page has enough context to confirm it's looking at the right order before advancing it. Read-only — no transaction, no write.

### 4.4 Role-claim script

`scripts/set-user-role.ts`, run manually via `tsx` (not an app feature, not exposed via any route) — takes a UID and a role (`admin` or `staff`) as CLI args, calls `getAuth(getAdminApp()).setCustomUserClaims(uid, {role})` via the Admin SDK. This is the one-time bootstrap the whole plan depends on: without it, no account can ever pass `getStaffUserIdFromAuthHeader`'s check, since nothing else in this codebase (per Plan A's explicit decision) ever sets a role claim.

## 5. Minimal staff UI

One new page, `apps/web/app/staff/orders/page.tsx` — client-side gated by checking the signed-in user's ID token for the `role` claim (via `user.getIdTokenResult()`, matching the same claim `getStaffUserIdFromAuthHeader` checks server-side); shows "Not authorized" and nothing else if the claim is absent. This client-side check is UX only — the real enforcement is the server route (§4.2) and `firestore.rules`, neither of which this page can bypass.

A single order-number text input. On submit, calls a new `GET /api/staff/orders/[orderNo]` (Admin-SDK, same staff-only gate as §4.2) to fetch the order + its current status, then renders: the order's line items (for context), its current status, and a form to advance it — a `<select>` constrained to only the statuses `isValidStatusTransition` allows from the current state, a `note` textarea, and `courier`/`awbNumber` fields that only appear when the selected next status is `shipped`. Submitting calls §4.2's route.

## 6. Customer-facing order tracking

Replaces the `(account)/orders` stub (currently static placeholder text) with two views:

- **List** (`apps/web/app/(account)/orders/page.tsx`): queries `orders` where `userId == <signed-in uid>`, ordered by `placedAt` descending — a simple list of order number, date, current status, and total, each linking to the detail view via the order's Firestore document id (`/orders/{orderId}`, not the human-facing `orderNo` — the customer never types or sees the doc id, it's just the link's internal parameter). Empty state for a signed-in customer with no orders yet.
- **Detail** (`apps/web/app/(account)/orders/[orderId]/page.tsx`): the order's line items (from `orders/{orderId}/items`, already readable per existing rules) and its full event timeline (`orders/{orderId}/events`, chronological, oldest first) — each event showing its status, `note` if present, and courier/AWB once shipped. Read directly via the client Firestore SDK (both subcollections are already owner-readable per `firestore.rules` — Plan B's `orders/{orderId}/items` rule and this plan touches nothing there), no new server route needed for reading.

## 7. Testing

Unit tests cover: `OrderEventSchema` validation; `isValidStatusTransition`'s full transition table (every allowed edge accepted, representative disallowed edges rejected, terminal states reject all outbound transitions); `getStaffUserIdFromAuthHeader` (valid staff token → uid, valid non-staff token → null, invalid/missing token → null); the advance route's five failure modes (403 non-staff, 404 unknown order, 400 missing courier/AWB when shipping, 400 invalid transition, and the happy-path 200 with the transaction's writes verified via a fake-transaction test matching this project's established `orderNumber.test.ts`/`idempotency.test.ts`/`reconcile-session.test.ts` pattern — pure core tested with fakes, thin Admin-SDK glue typechecked and manually traced). The customer-facing pages get component tests confirming the list renders orders and links correctly, and the detail page renders the timeline in the right order. Live verification (an actual staff account advancing a real seeded order through several transitions, confirming the customer-facing page reflects each change) is the plan's final task, mirroring Plan A/B's pattern — this needs the role-claim script actually run against a real account first, which is a manual step, not assumed to already exist.

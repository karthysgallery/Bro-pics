# Phase 5, Plan C — Production/Fulfillment Queue — Design

**Date:** 2026-09-09
**Status:** Approved by user (continuous-execution directive), ready for implementation planning
**Depends on:** [2026-09-05-order-tracking-design.md](2026-09-05-order-tracking-design.md) (Phase 4 Plan C — `isValidStatusTransition`, `getStaffUserIdFromAuthHeader`, the single-order-lookup `/staff/orders` page this plan extends)

## 1. Purpose and scope

Plan C of Phase 5, the last of the three: replaces `/staff/orders`' single order-number lookup with a real queue — a staff member can see every order sitting in a given status (e.g. every `paid` order waiting to start production) instead of needing to already know an order number. This is exactly the gap Phase 4 Plan C's own design doc called out as deliberately out of scope ("A staff order list/production queue... Phase 5's job").

Out of scope, deliberately:
- **Courier API integration.** Unchanged Foundation decision — AWB stays manually typed.
- **Bulk actions** (advancing multiple orders at once). One order at a time, matching the existing advance flow exactly.
- **Reworking the advance form itself.** The existing status-transition `<select>`/note/courier/AWB form (built in Phase 4 Plan C) is reused as-is — this plan only adds a way to get an order INTO that form without typing its number.
- **Any change to `isValidStatusTransition` or the `OrderEvent` write path.** Untouched.

## 2. New route: `GET /api/staff/orders?status=<OrderStatus>`

Staff-or-admin gated (`getStaffUserIdFromAuthHeader`, `403` otherwise — same sensitivity as the existing lookup/advance routes, not admin-only like Plan B's role management). `400` if `status` is missing or not a valid `OrderStatus`. Queries `orders` where `status == <status>`, ordered by `placedAt` **ascending** (oldest first — a fulfillment queue processes in FIFO order, the opposite of the customer-facing order-history list's newest-first ordering). Returns an array of `{id, orderNo, status, total, placedAt, addressJson}` — enough for a staff member to recognize which order is which (customer name/city live in `addressJson`) without a second round-trip per row.

Requires a new Firestore composite index (`orders`: `status` ASC, `placedAt` ASC) — `firestore.indexes.json` gets a new entry, and it must actually be deployed (`firebase deploy --only firestore:indexes`) before the route works against the live project, the same gap this project has hit before (see PROJECT_STATUS.md's account of Phase 4's own missing `frameTemplates` index).

## 3. `/staff/orders` page gains a queue view

The existing page (order-number input, lookup, advance form) is extended, not replaced. A new status filter (`<select>`, defaulting to `paid` — the first status a staff member actually needs to act on) sits above the existing order-number input, calling §2's route and rendering the matching orders as a simple list (order number, status, total, placed date). Clicking a row in that list populates the SAME state the manual order-number lookup already populates (`order`, `items`, resets `nextStatus`/`courier`/`awbNumber`) by calling the existing single-order lookup route (`GET /api/staff/orders/[orderNo]`) with that row's `orderNo` — the advance form below is unchanged and works identically regardless of whether the order got there by typed lookup or a queue click.

## 4. Testing

- The new route: `403` non-staff, `400` missing/invalid status, `200` with the right shape and ordering (a fake-Firestore-query test matching this project's established route-test style, not a live emulator).
- The page: queue list renders returned orders; clicking a queue row triggers the existing single-order lookup and populates the advance form (extending the existing `staff/orders/page.test.tsx`, not rewriting it).

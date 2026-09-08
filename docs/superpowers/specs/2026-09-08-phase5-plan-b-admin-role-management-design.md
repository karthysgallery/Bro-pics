# Phase 5, Plan B — Admin Role Management — Design

**Date:** 2026-09-08
**Status:** Approved by user (continuous-execution directive), ready for implementation planning
**Depends on:** [2026-09-05-order-tracking-design.md](2026-09-05-order-tracking-design.md) (Phase 4 Plan C — `getStaffUserIdFromAuthHeader`, `isStaffOrAdmin()`, the `set-user-role.ts` bootstrap script), [2026-09-06-phase5-plan-a-foundations-design.md](2026-09-06-phase5-plan-a-foundations-design.md) (Phase 5 Plan A — sign-out, `AuthContextValue`)

## 1. Purpose and scope

Plan B of Phase 5: a real UI for granting/revoking the `admin`/`staff` custom claim, replacing the manual `scripts/seed/src/set-user-role.ts` CLI script as the ongoing way roles get managed — the script stays in the repo as the one-time bootstrap tool (see §4), it just stops being the *only* way.

Out of scope, deliberately:
- **The production/fulfillment queue.** Plan C's job.
- **Any other admin panel surface** (products, orders overview, settings). Not requested, not needed to unblock Plan C.
- **Self-service role requests.** An admin looks up a specific account by phone and sets its role directly — there's no request/approval workflow.
- **Listing every user account.** Firebase Auth has no cheap "list all users with a role" query; this plan works by exact-phone lookup, one account at a time, matching the scale this project actually operates at (a handful of staff, not hundreds).

## 2. Authorization: admin-only, not staff

Order lookup/advance (Plan C) is staff-**or**-admin. Granting roles is more sensitive — only `admin` can do it. `apps/web/lib/verify-id-token.ts` gains `getAdminUserIdFromAuthHeader(request): Promise<string | null>`, identical in shape to `getStaffUserIdFromAuthHeader` but checking `role === 'admin'` exactly (not `'admin' || 'staff'`). Same contract: `null` always means the caller responds `403`, never "proceed as signed out."

## 3. Two Admin-SDK routes

- **`GET /api/admin/users/lookup?phone=<E.164>`** — admin-only (`getAdminUserIdFromAuthHeader`, `403` otherwise). Calls `getAuth(getAdminApp()).getUserByPhoneNumber(phone)`. `404` if no account has that phone number. On success, returns `{uid, phoneNumber, role: string | null}` (`role` read off `user.customClaims?.role ?? null`).
- **`POST /api/admin/users/[uid]/role`** — admin-only, same gate. Body: `{role: 'admin' | 'staff' | null}` (`null` revokes — the account keeps signing in normally, it just stops passing `isStaffOrAdmin()`). `400` if `role` is present but not one of those three values. Calls `getAuth(getAdminApp()).setCustomUserClaims(uid, role ? {role} : {})`. Returns `{uid, role}`.

Both routes are thin Admin-SDK glue, following this project's established "business logic in `apps/web/app/api/*`" convention (same as Plan C's staff routes) — not Cloud Functions.

## 4. Bootstrap stays manual, and that's fine

`set-user-role.ts` remains — it's how the *first* admin account gets created (nothing in this plan lets a non-admin grant `admin` to themselves). This is the same one-time step Plan C's staff-verification task already deferred and PROJECT_STATUS.md already tracks; this plan doesn't remove that dependency, it just means once one admin account exists, every subsequent role change goes through the UI instead of a second manual `tsx` invocation.

## 5. Minimal admin UI

One new page, `apps/web/app/admin/roles/page.tsx` — client-side gated the same way `/staff/orders` is (`user.getIdTokenResult()`, checking `role === 'admin'` specifically; shows "Not authorized" otherwise). This is UX only, same caveat as Plan C's staff page: the real enforcement is §3's server routes.

A phone-number input + "Look up" button calling §3's `GET` route. On a match, shows the account's phone number, its current role (or "No role"), and a role selector (`admin` / `staff` / `none`) + "Save" button calling §3's `POST` route. `404` from the lookup shows "No account with that phone number."

## 6. Testing

- `getAdminUserIdFromAuthHeader`: valid admin token → uid; valid staff (non-admin) token → `null`; invalid/missing token → `null` (mirrors `getStaffUserIdFromAuthHeader`'s existing test shape).
- Lookup route: `403` non-admin, `404` unknown phone, `200` with `{uid, phoneNumber, role}` on a match (including the `role: null` case for an account with no claim yet).
- Role route: `403` non-admin, `400` invalid `role` value, `200` happy path for each of `admin`/`staff`/`null`, asserting `setCustomUserClaims` is called with the right shape (`{role}` vs `{}`).
- Page: renders "Not authorized" when the claim check resolves false; renders the lookup form and result state when it resolves true (component test with a mocked fetch, matching `apps/web/app/staff/orders/page.test.tsx`'s existing pattern for testing a client-gated staff/admin page — same `user.getIdTokenResult()` mocking approach, reused here rather than invented fresh).

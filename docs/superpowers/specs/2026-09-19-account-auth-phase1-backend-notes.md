# Account + Auth Phase 1 — backend notes

Companion to the Phase 1 plan (order actions, My Reviews, account deletion,
session revocation, OTP UX hardening). Everything actually built this round
lives entirely in `apps/web` (Next.js API routes using `firebase-admin`,
same established boundary as every other admin/staff route) — no
`firestore.rules`, `functions`, or `packages/shared` changes were needed.
The two items below are real gaps this round intentionally did NOT build,
because they require a genuine policy or architecture decision rather than
a frontend implementation choice.

## 1. Account-deletion data retention — an open policy question

`DELETE` on account deletion currently removes only:
- the Firebase Auth user (`deleteUser`)
- the `users/{uid}` profile doc (`deleteDoc`, owner-writable per existing rules)

It deliberately does **not** touch the user's `orders`, `reviews`, or
`addresses` (`addresses` is a subcollection of `users/{uid}` and is
technically owner-deletable, but is left alone here too). What should
happen to this data after account deletion is a business/legal decision,
not a technical one:

- **Cascade-delete everything** — simplest, but orders are often retained
  for a period for accounting/tax/dispute purposes even after a customer
  deletes their account elsewhere.
- **Anonymize and retain** — keep `orders`/`reviews` for business records
  but strip the `userId` link (or replace it with a tombstone value), so
  the data survives without staying attributable to a deleted account.
- **Retain as-is** — simplest to implement, but means a "deleted" account's
  order history is still technically queryable by staff under the old uid,
  which may not match what "delete my account" implies to the customer.

Whoever owns this decision should also confirm whether it needs to happen
synchronously (blocking the deletion) or asynchronously (a scheduled
Cloud Function triggered off the Auth user-deletion event) — the former is
simpler; the latter is the standard Firebase pattern for this kind of
cleanup and wouldn't require the client to wait on it.

## 2. Active session / device listing — not built, real architecture gap

The spec's "active sessions" list (dashboard showing every device
currently signed in, with per-device revoke) has **no equivalent** in
Firebase's client SDK — unlike a JWT-over-SQL stack that tracks sessions in
its own table, Firebase Auth's session model doesn't expose "list of
currently valid refresh tokens" to either the client or `firebase-admin`.

"Logout from all devices" (`admin.auth().revokeRefreshTokens(uid)`, built
this round) covers the destructive half of this feature — it works today.
Only the *visibility* half (seeing what's currently signed in before
choosing to revoke) is the gap, and building it means a real schema
addition:

- A new `users/{uid}/sessions/{sessionId}` Firestore collection, written on
  each successful sign-in (rough device/browser info, an approximate
  location if desired, `lastSeenAt`), read back by the account page.
- Revoking a single session from this list can't selectively invalidate
  one Firebase refresh token (Firebase only supports revoking ALL of a
  user's refresh tokens at once) — a single-session "sign out this device"
  action would need to be enforced by the app itself checking a per-session
  `revokedAt` timestamp on every request, not by Firebase Auth.

This is a real new subsystem, not a Phase 1-sized addition — flagged for
its own future round rather than attempted partially here.

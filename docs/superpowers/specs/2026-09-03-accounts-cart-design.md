# Phase 4, Plan A — Accounts & Cart Persistence — Design

**Date:** 2026-09-03
**Status:** Approved by user, ready for implementation planning
**Depends on:** [2026-08-28-foundation-design.md](2026-08-28-foundation-design.md) (data model — `users`, `carts` collections and `firestore.rules` originally sketched here), [2026-08-31-personalization-engine-design.md](2026-08-31-personalization-engine-design.md) (anonymous `sessionId`-owned `uploads`/`customizations`, explicitly deferring the account-reconciliation problem to this phase)

## 1. Purpose and scope

This is Plan A of Phase 4 (Cart, Checkout, Razorpay, Accounts, Order Tracking), split into three plans:

- **Plan A (this doc): Accounts & Cart Persistence** — Firebase Auth, `User`/`Address` schemas, real cart persistence, and reconciling Phase 3's anonymous session-owned uploads/customizations to a logged-in user.
- **Plan B: Checkout + Razorpay** — address collection UI, `OrderSchema` money-invariant validation, Razorpay Orders API + webhook, shipping rules (still waiting on the client for exact values).
- **Plan C: Order Tracking** — manual AWB/tracking entry, status timeline.

Locked decisions carried in from brainstorming, all "Recommended" answers:
- **Login is required before checkout.** No guest checkout path.
- **Phone-OTP-only sign-in.** Email is an optional profile field, not a second credential.
- **Cart stays local-only (React state, not Firestore) until login.** It merges into Firestore at the moment of login, not before.

Out of scope, deliberately:
- **Address management UI.** The `AddressSchema` is defined here (§2.2) so Plan B isn't blocked, but building, editing, and choosing among saved addresses is checkout-adjacent and belongs to Plan B.
- **Role claims (`admin`/`staff`).** Every account created through this plan is implicitly a customer — no custom claims are set. Role-based access is Phase 5 (Admin Panel)'s concern; `isStaffOrAdmin()` in `firestore.rules` already exists and is unaffected by this plan.
- **Shipping rules, Razorpay, order totals.** Plan B.

## 2. Data model additions

### 2.1 New `UserSchema`

Foundation's original data model named a `users/{userId}` collection with rules already written (`firestore.rules:88-96`), but no zod schema was ever built — same gap pattern as `ProductMedia` and `UploadSchema` before it.

```ts
// packages/shared/src/schemas/user.ts
{
  id: string,           // == Firebase Auth uid
  phone: string,        // E.164, from Auth — the verified sign-in credential
  email: string | null, // optional profile field, never a sign-in credential
  displayName: string | null,
  createdAt: string,    // ISO, set once on first login
  updatedAt: string,    // ISO, touched on every login
}
```

### 2.2 New `AddressSchema`

Also named in Foundation's data model (`users/{userId}/addresses/{addressId}`, rules already exist at `firestore.rules:92-95`), never built. Defined now so Plan B can write to it without a schema gap; the UI to manage these is Plan B's.

```ts
// packages/shared/src/schemas/address.ts
{
  id: string,
  label: string | null,   // "Home", "Work", etc.
  line1: string,
  line2: string | null,
  city: string,
  state: string,
  pincode: string,
  phone: string,          // contact phone for this address, may differ from account phone
  isDefault: boolean,
}
```

### 2.3 `CartItem` gains `previewUrl`

```ts
// apps/web/lib/cart-context.tsx
export interface CartItem {
  variantId: string;
  personalizationId: string;
  title: string;
  unitPriceSnapshot: number;
  qty: number;
  previewUrl?: string;   // NEW — denormalized from Customization.previewUrl at add-to-cart time
}
```

Today, two cart lines for the same variant with different personalizations render identically in `CartDrawer` (same title, no way to tell them apart). `previewUrl` is written once when the item is added — no live lookup, no risk of a stale-if-missing render — and gives `CartDrawer` a thumbnail to distinguish lines.

### 2.4 Cart storage path: `carts/{sessionId}` → `carts/{userId}`

`firestore.rules:103-106` currently reserves `carts/{sessionId}`, fully denied (`if false`) — never implemented, since Phase 3 kept the cart local-only. Per the "cart persists at login" decision, the collection is keyed by `userId`, not session:

```
carts/{userId}: { items: CartItem[], updatedAt: string }
```

A single doc per user (not a subcollection of line items) — cart item counts are small (single digits), and a single-doc read/write keeps the merge-at-login operation (§4) a single write instead of N.

## 3. Firestore rules fork

This is the first phase with a real, verifiable `request.auth.uid` (Phase 3's `sessionId` is client-supplied and unverifiable, which is why every Phase 3 write went through an Admin-SDK server route). `isOwner(userId)` (`firestore.rules:10-12`) already exists and is currently unused. This plan puts it to work:

| Path | Before | After |
|---|---|---|
| `users/{userId}` | `read: isOwner\|\|staff`, `write: false` | `read: isOwner(userId) \|\| isStaffOrAdmin()`, `write: isOwner(userId)` (staff/admin stay read-only, matching existing intent) |
| `users/{userId}/addresses/{addressId}` | `read: isOwner\|\|staff`, `write: false` | `read: isOwner(userId) \|\| isStaffOrAdmin()`, `write: isOwner(userId)` |
| `carts/{userId}` | `read, write: false` (path was `sessionId`) | `read, write: isOwner(userId)` |

Routine cart operations (change qty, remove line) become direct client writes through these rules — no server round-trip needed, unlike Phase 3's uploads/customizations which stay server-only because reassigning their ownership is a privileged, one-time operation (§4), not a routine write.

`uploads`/`customizations` writes stay server-only (Admin SDK), as Phase 3 left them. Their *read* rules change to reflect the new `userId` field from §4: `uploads/{uploadId}` already checks `isOwner(resource.data.userId) || isStaffOrAdmin()` (unreachable until now, since no doc had `userId`) and needs no rule change, only the schema field. `customizations/{id}` gains the equivalent owner-read clause, replacing its current staff-only read.

## 4. Login-time reconciliation

`UploadSchema` and `CustomizationSchema` both gain a new optional field, `userId: z.string().optional()`, left unset until reconciliation. `firestore.rules:78-81` already expects `uploads/{uploadId}`'s owner-read check to key off `resource.data.userId` — a field neither schema had until now, meaning that read rule has been unreachable since Phase 3. `customizations/{id}` gets the matching owner-read clause added (`isOwner(resource.data.userId) || isStaffOrAdmin()`, replacing the current staff-only read). `sessionId` is left untouched on both — it stays as the original-session audit trail, and `userId` becomes the ownership field used for access control from this point on.

One HTTPS callable, `reconcileSessionOnLogin(sessionId, cartItems)`, invoked once by the client immediately after a successful phone-OTP sign-in. Runs under the Admin SDK as a single Firestore transaction — all three writes commit together or none do:

1. Query `uploads` and `customizations` where `sessionId == <the local sessionId>` → set each matched doc's `userId` field to the now-known `userId` (`sessionId` is left as-is).
2. Write `cartItems` (the client's local, pre-login cart state) into `carts/{userId}`, merging with anything already stored there (a returning user logging in on a second device) by summing `qty` for matching `(variantId, personalizationId)` pairs.
3. Upsert `users/{userId}`: create the profile doc on first login (`phone` from the verified Auth token, `createdAt` set), or touch `updatedAt` if it already exists.

**Failure handling:** if the transaction fails for any reason, nothing commits. The client's local cart state is left untouched (not cleared, not assumed-merged) and the callable can be retried — mirroring the exact bug class Task 7's `handleDone` had (a partial write reported as success). The client only clears its local cart state after the callable returns success.

This callable is the plan's highest-risk seam: it spans client state, Firebase Auth, and three Firestore collections, and a mocked test will pass whether or not it actually works end-to-end. Per §6, it is verified against the live `bropics-app` project, not only against mocks.

## 5. Build order

1. `UserSchema`, `AddressSchema` in `packages/shared`.
2. `firestore.rules` changes (§3), deployed and tested against the live project's emulator/rules-test setup already established in Foundation.
3. Firebase Auth phone-OTP sign-in UI (reCAPTCHA verifier) + a `useAuth()` hook exposing the current user.
   - **Manual infra step:** enable the Phone sign-in provider and register test phone numbers in the Firebase Console — same category of manual step as the Storage/CORS setup in earlier phases.
4. `reconcileSessionOnLogin` callable (§4).
5. Cart persistence swap: `CartProvider` gains a Firestore-backed mode once a user is signed in (reads/writes `carts/{userId}` directly per the rules in §3), while staying local-only (current behavior, unchanged) when signed out.
6. `CartDrawer` fixes: render `previewUrl` thumbnails; add the missing lower-bound guard on the quantity input (currently clearing the field yields `qty: 0`/`NaN` — tracked in `PROJECT_STATUS.md` as a pre-Phase-4 gap).

## 6. Testing

Unit tests (zod schema validation, cart-merge quantity-summing logic, rules tests via the existing Foundation-phase rules-testing setup) cover the mechanical pieces. The `reconcileSessionOnLogin` callable is additionally verified against the live `bropics-app` project directly: a real phone-OTP sign-in with a Console-registered test number, a real local cart with items referencing real seeded `uploads`/`customizations` docs, then reading back Firestore afterward to confirm all three writes landed (or, for a deliberately-forced failure case, that none did).

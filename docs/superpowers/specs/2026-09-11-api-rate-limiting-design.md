# API Rate Limiting — Design

**Date:** 2026-09-11
**Status:** Approved (user directive: "go through the project completely and check where the rate limiter is needed then set the rate limiter for all those in a single file"), ready for implementation planning

## 1. Purpose and scope

No rate limiting exists anywhere in this project today (confirmed by grep — zero matches for `rate.?limit` across `apps/web`, `functions`, `packages`, and every spec/plan doc). Every one of the 15 Next.js API routes under `apps/web/app/api/**` is currently unprotected against request-volume abuse: no per-IP or per-user throttling on uploads, checkout, coupon validation, reviews, or any staff/admin endpoint.

This plan adds a single centralized rate-limiting module and wires it into every route that needs it, so all limiter configuration lives in and is auditable from one file.

Out of scope, deliberately:
- **`functions/src/webhooks/razorpay.ts`** (the Razorpay webhook Cloud Function). It's a separate deploy target (Cloud Functions, not the Next.js app) with its own runtime boundary, already has signature verification and idempotency guarding duplicate processing, and rate-limiting a webhook risks dropping legitimate retries Razorpay itself sends on failure. Pulling it into the same "single file" would mean either duplicating the limiter across two codebases or routing it through `packages/shared` — real architectural surface for a webhook that already has better-suited protections. Noted here, not built.
- **A distributed/shared-state backend (Redis, Upstash, Firestore-counter-per-request).** This project's traffic target is 500–1,000 visitors/day (per the original spec), and there's no existing cache/queue infrastructure anywhere in the stack. An in-memory limiter (§2) gives real, meaningful protection at this scale with zero new infrastructure, zero new cost, and zero new account to set up — consistent with this project's established pattern of shipping a pragmatic solution now with the upgrade path documented (same treatment as COD/GST/WhatsApp in the locked-in architecture decisions). The accepted limitation — state doesn't share across horizontally-scaled instances — is written up explicitly in §5, not hidden.
- **IP-based blocking/banning, CAPTCHA, or any bot-detection.** Out of scope for a rate limiter; this only throttles request *rate*, it doesn't try to distinguish humans from bots.

## 2. The limiter itself — `apps/web/lib/rate-limit.ts`

A single new file, in-memory fixed-window (tumbling-window) counter, zero new dependencies (no Redis/Upstash package — just a `Map` and `Date.now()`) (accepted tradeoff: a fixed window permits up to a 2x burst right at a window boundary, which is fine given this project's 500–1,000 visitors/day traffic target — a true sliding window was judged not worth the added complexity at this scale).

```ts
interface RateLimitConfig {
  windowMs: number;
  max: number;
}

// All limiter configuration lives here — the single source of truth this
// project's routes are audited against. Add a new named tier here, not a
// bespoke check inline in a route.
export const RATE_LIMITS = {
  // Expensive: image processing + Storage writes. Abuse here costs real
  // money (Storage bytes, Sharp CPU).
  upload: { windowMs: 60_000, max: 10 },
  // Money-critical: creates a real Razorpay order (an external API call)
  // and writes an Order doc. Generous enough for legitimate retry-after-
  // failed-payment, tight enough to block scripted abuse.
  checkout: { windowMs: 60_000, max: 8 },
  // Cheap Firestore reads/writes behind a signed-in check, but still
  // writeable/enumerable (coupon codes) — moderate.
  write: { windowMs: 60_000, max: 20 },
  // Read-only, called on every keystroke by the client (search-suggestions
  // typeahead) — generous, short window.
  read: { windowMs: 10_000, max: 30 },
  // Staff/admin routes: already gated by a custom-claim check, so the
  // abuse model is "a compromised or buggy staff session," not the public
  // internet — generous but present, so a runaway client script can't
  // hammer Firestore indefinitely.
  staff: { windowMs: 60_000, max: 60 },
} as const satisfies Record<string, RateLimitConfig>;

export type RateLimitTier = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

// Keyed by `${tier}:${identity}` so the same client's uploads and checkout
// usage are tracked independently. Never cleared explicitly — expired
// entries are lazily evicted on their own next lookup (see implementation
// plan for the exact eviction approach), so this never needs a cron job,
// but does mean memory grows with distinct-client count between evictions.
const buckets = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(request: Request, tier: RateLimitTier): RateLimitResult {
  // implementation in the plan
}
```

`checkRateLimit` extracts an identity key from the request itself — never from a caller-supplied string — so every route calls it the same way: `checkRateLimit(request, 'upload')`. Identity: `x-forwarded-for`'s first IP (set by Firebase App Hosting/Cloud Run's front-end proxy for every request; falls back to a constant `'unknown'` key if absent, which degrades to a single shared bucket rather than throwing — never block a request because a header was missing). IP is available synchronously, before any `verifyIdToken` call, so unauthenticated abuse is rejected before the route does any real work (Firestore reads, Storage writes, or Auth verification).

Every route calls `checkRateLimit` as the **first** line of its handler, before touching `request.formData()`/`request.json()`/Firestore/Storage — a 429 response never incurs Storage or Firestore cost. On `allowed: false`, the route returns:

```ts
return NextResponse.json(
  { error: 'Too many requests, please try again shortly' },
  { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } }
);
```

matching every existing route's established `NextResponse.json({ error }, { status })` convention exactly — no new response shape introduced.

## 3. Where it's applied — all 15 `apps/web/app/api/**` routes

| Route | Method | Tier | Why |
|---|---|---|---|
| `uploads` | POST | `upload` | Image processing + Storage write, real cost per call |
| `uploads/preview` | POST | `upload` | Same cost profile as `uploads` |
| `customizations` | POST | `write` | Firestore write, session/user-scoped |
| `checkout/create-order` | POST | `checkout` | Creates a real Razorpay order + Order doc |
| `checkout/coupon/validate` | POST | `write` | Cheap read, but a brute-forceable coupon-code enumeration surface |
| `reviews` | POST | `write` | Firestore write behind a signed-in + verified-purchase check |
| `search-suggestions` | GET | `read` | Called on every keystroke — needs the generous tier, not `write`'s |
| `frame-templates/[variantId]` | GET | `read` | Cheap Firestore read, low risk, still worth a floor |
| `staff/orders` | GET | `staff` | Staff-gated |
| `staff/orders/[orderNo]` | GET | `staff` | Staff-gated |
| `staff/orders/[orderNo]/advance` | POST | `staff` | Staff-gated, mutates order status |
| `staff/reviews` | GET | `staff` | Staff-gated |
| `staff/reviews/[id]/moderate` | POST | `staff` | Staff-gated, mutates review status |
| `admin/users/lookup` | GET | `staff` | Admin-gated |
| `admin/users/[uid]/role` | POST | `staff` | Admin-gated, mutates a role claim — most sensitive route in the app, but the `staff` tier's 60/min is already tight for a route no legitimate admin calls more than a handful of times per session; a bespoke tighter tier isn't worth a 6th config entry for one route |

All 15 existing routes get a rate-limit check. No route is left unprotected, and no new tier is invented beyond the 5 in §2 — every route maps onto one of them.

## 4. Testing

`apps/web/lib/rate-limit.test.ts`: unit tests against `checkRateLimit` directly (not through a route) — under-limit requests allowed, over-limit requests blocked with a `retryAfterSeconds`, the window resetting after `windowMs` elapses (using a fake/mocked clock, not a real `setTimeout` wait), and two different IPs/tiers tracked independently (one client's `upload` usage doesn't affect their own `checkout` bucket, and two different IPs each get their own `upload` bucket).

Each of the 15 route files' existing test suites gets one new test: a request that exceeds the tier's `max` within `windowMs` receives a 429 with a `Retry-After` header, and the route's real logic (Firestore/Storage calls) is never reached (assert the relevant mock was not called). Exact mocking approach (resetting the module-level `buckets` Map between test files, since it's shared in-process state) is the implementation plan's concern, not this design doc's.

## 5. Documented limitation

`PROJECT_STATUS.md` gets a new §5 gap bullet: the limiter is in-memory and per-instance — if Firebase App Hosting scales to more than one Cloud Run instance, each instance has its own independent bucket state, so the *effective* limit across the whole app is `max × instance count`, not a hard global cap. At this project's target traffic (500–1,000 visitors/day), App Hosting is expected to run on a small number of instances, so this is a real but proportionate gap, not a broken feature — same category as the already-accepted `usedCount` concurrency race in Phase 6 Plan B. Upgrading to a shared backend (Firestore-counter or a Redis-compatible service) is a documented future upgrade path, not attempted now (§1).

# API Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one centralized in-memory rate limiter (`apps/web/lib/rate-limit.ts`) and apply it as the first line of every one of the 14 `apps/web/app/api/**` route handlers.

**Architecture:** A single module exports a `RATE_LIMITS` config object (5 named tiers) and a `checkRateLimit(request, tier)` function keyed by client IP (`x-forwarded-for`) with an in-memory `Map`-backed sliding window. Every route imports it and calls it before doing any other work.

**Tech Stack:** Next.js App Router route handlers (`apps/web`), Vitest, `vi.useFakeTimers()` for window-expiry tests.

## Global Constraints

- Single file for all limiter config/logic: `apps/web/lib/rate-limit.ts`. No route defines its own ad hoc limit.
- Every route's `checkRateLimit` call is the FIRST statement in its handler — before `request.formData()`/`request.json()`, before any Firestore/Storage/Auth call. A blocked request must never incur those costs.
- 429 response shape matches every existing route's `NextResponse.json({ error }, { status })` convention exactly: `NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } })`.
- Tier assignment per route is fixed by the design doc's §3 table — do not invent a 6th tier or bespoke per-route limit.
- `functions/src/webhooks/razorpay.ts` is explicitly out of scope — do not touch it.
- Branch: `feature/admin-panel-and-production-queue` (current branch, do not create a new one). Commit after every task.

---

### Task 1: `apps/web/lib/rate-limit.ts` — the limiter itself

**Files:**
- Create: `apps/web/lib/rate-limit.ts`
- Create: `apps/web/lib/rate-limit.test.ts`

**Interfaces:**
- Produces: `RATE_LIMITS` (the 5-tier config object), `RateLimitTier` (its key type), `RateLimitResult` (`{ allowed: boolean; retryAfterSeconds?: number }`), `checkRateLimit(request: Request, tier: RateLimitTier): RateLimitResult` — every later task imports these three names from this one file.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit, RATE_LIMITS, resetRateLimitState } from './rate-limit';

function makeRequest(ip: string): Request {
  return new Request('http://localhost/api/test', { headers: { 'x-forwarded-for': ip } });
}

describe('checkRateLimit', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.useRealTimers();
  });

  it('allows requests under the tier max', () => {
    const req = makeRequest('1.1.1.1');
    for (let i = 0; i < RATE_LIMITS.read.max; i++) {
      expect(checkRateLimit(req, 'read').allowed).toBe(true);
    }
  });

  it('blocks a request once the tier max is exceeded within the window', () => {
    const req = makeRequest('1.1.1.2');
    for (let i = 0; i < RATE_LIMITS.upload.max; i++) {
      checkRateLimit(req, 'upload');
    }
    const result = checkRateLimit(req, 'upload');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('resets the window after windowMs elapses', () => {
    vi.useFakeTimers();
    const req = makeRequest('1.1.1.3');
    for (let i = 0; i < RATE_LIMITS.checkout.max; i++) {
      checkRateLimit(req, 'checkout');
    }
    expect(checkRateLimit(req, 'checkout').allowed).toBe(false);

    vi.advanceTimersByTime(RATE_LIMITS.checkout.windowMs + 1);
    expect(checkRateLimit(req, 'checkout').allowed).toBe(true);
    vi.useRealTimers();
  });

  it('tracks two different IPs independently', () => {
    const reqA = makeRequest('2.2.2.1');
    const reqB = makeRequest('2.2.2.2');
    for (let i = 0; i < RATE_LIMITS.write.max; i++) {
      checkRateLimit(reqA, 'write');
    }
    expect(checkRateLimit(reqA, 'write').allowed).toBe(false);
    expect(checkRateLimit(reqB, 'write').allowed).toBe(true);
  });

  it('tracks two different tiers for the same IP independently', () => {
    const req = makeRequest('3.3.3.3');
    for (let i = 0; i < RATE_LIMITS.upload.max; i++) {
      checkRateLimit(req, 'upload');
    }
    expect(checkRateLimit(req, 'upload').allowed).toBe(false);
    expect(checkRateLimit(req, 'checkout').allowed).toBe(true);
  });

  it('falls back to a shared "unknown" bucket when x-forwarded-for is missing, without throwing', () => {
    const req = new Request('http://localhost/api/test');
    expect(() => checkRateLimit(req, 'read')).not.toThrow();
    expect(checkRateLimit(req, 'read').allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bro-pics/web test -- rate-limit.test.ts`
Expected: FAIL — `./rate-limit` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/rate-limit.ts`:

```ts
interface RateLimitConfig {
  windowMs: number;
  max: number;
}

// All limiter configuration lives here — the single source of truth every
// route is audited against. Add a new named tier here, not a bespoke check
// inline in a route.
export const RATE_LIMITS = {
  // Expensive: image processing + Storage writes. Abuse here costs real
  // money (Storage bytes, Sharp CPU).
  upload: { windowMs: 60_000, max: 10 },
  // Money-critical: creates a real Razorpay order (an external API call)
  // and writes an Order doc. Generous enough for legitimate retry-after-
  // failed-payment, tight enough to block scripted abuse.
  checkout: { windowMs: 60_000, max: 8 },
  // Cheap Firestore reads/writes behind a signed-in check, but still a
  // writeable/enumerable surface (e.g. coupon codes) — moderate.
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

interface Bucket {
  count: number;
  windowStart: number;
}

// Keyed by `${tier}:${ip}` so one client's usage of different tiers is
// tracked independently. Entries are lazily evicted the next time their
// own key is looked up after expiring — no cron/interval needed, at the
// cost of memory growing with distinct-client count between lookups. This
// is in-process, per-instance state: see the design doc §5 for the
// accepted multi-instance limitation.
const buckets = new Map<string, Bucket>();

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (!forwardedFor) return 'unknown';
  const first = forwardedFor.split(',')[0]?.trim();
  return first || 'unknown';
}

export function checkRateLimit(request: Request, tier: RateLimitTier): RateLimitResult {
  const config = RATE_LIMITS[tier];
  const ip = getClientIp(request);
  const key = `${tier}:${ip}`;
  const now = Date.now();

  const existing = buckets.get(key);
  if (!existing || now - existing.windowStart >= config.windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (existing.count < config.max) {
    existing.count += 1;
    return { allowed: true };
  }

  const retryAfterSeconds = Math.ceil((existing.windowStart + config.windowMs - now) / 1000);
  return { allowed: false, retryAfterSeconds };
}

// Test-only: clears all bucket state between test cases. Not used by any
// route — only imported from rate-limit.test.ts.
export function resetRateLimitState(): void {
  buckets.clear();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bro-pics/web test -- rate-limit.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @bro-pics/web typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/rate-limit.ts apps/web/lib/rate-limit.test.ts
git commit -m "feat(rate-limit): add centralized in-memory rate limiter"
```

---

### Task 2: Apply to upload + write-tier routes

**Files:**
- Modify: `apps/web/app/api/uploads/route.ts`
- Modify: `apps/web/app/api/uploads/preview/route.ts`
- Modify: `apps/web/app/api/customizations/route.ts`
- Modify: `apps/web/app/api/checkout/coupon/validate/route.ts`
- Modify: `apps/web/app/api/reviews/route.ts`
- Modify (tests): the existing `.test.ts` file next to each route above (extend, don't replace)

**Interfaces:**
- Consumes: `checkRateLimit`, `RATE_LIMITS` from `../../../lib/rate-limit` (adjust relative path per file depth — e.g. `checkout/coupon/validate/route.ts` needs `../../../../../lib/rate-limit`).

For **each** of the 5 route files above, apply this exact pattern (tier per the table: `uploads`→`upload`, `uploads/preview`→`upload`, `customizations`→`write`, `checkout/coupon/validate`→`write`, `reviews`→`write`):

- [ ] **Step 1: Add the import and the first-line check**

Add near the top of the file's import block:
```ts
import { checkRateLimit } from '<relative-path-to>/lib/rate-limit';
```

As the FIRST statement inside the route's exported handler function (before any other line — including existing header reads like `X-Session-Id`), add:
```ts
export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, '<tier>');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  // ...existing handler body, unchanged...
}
```

- [ ] **Step 2: Add one test per route asserting the 429 path**

In each route's existing `.test.ts` file, add a test following that file's existing mocking conventions (check how it currently mocks `firebase-admin/firestore` etc.):

```ts
import { checkRateLimit } from '<relative-path>/lib/rate-limit';

vi.mock('<relative-path>/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('<relative-path>/lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

// inside a describe/it, alongside the file's existing tests:
it('returns 429 and does not touch Firestore when rate-limited', async () => {
  vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });
  const request = new Request('http://localhost/api/<route>', { method: 'POST' /* + whatever headers/body this route's other tests already use */ });
  const response = await POST(request);
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('42');
  // assert the route's Firestore/Storage mock was NOT called — use
  // whatever mock this file already has (e.g. expect(getFirestore).not.toHaveBeenCalled()
  // or the specific collection/doc mock the file already sets up)
});
```

Adapt the exact mock-not-called assertion to each file's existing mock setup — read the file's other tests first to match its established pattern rather than inventing a new one.

- [ ] **Step 3: Run each route's test file and confirm it passes**

Run: `pnpm --filter @bro-pics/web test -- uploads customizations coupon reviews`
Expected: PASS, including the 5 new 429 tests.

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @bro-pics/web typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/uploads/route.ts apps/web/app/api/uploads/route.test.ts \
  apps/web/app/api/uploads/preview/route.ts apps/web/app/api/uploads/preview/route.test.ts \
  apps/web/app/api/customizations/route.ts apps/web/app/api/customizations/route.test.ts \
  apps/web/app/api/checkout/coupon/validate/route.ts apps/web/app/api/checkout/coupon/validate/route.test.ts \
  apps/web/app/api/reviews/route.ts apps/web/app/api/reviews/route.test.ts
git commit -m "feat(rate-limit): apply to uploads, customizations, coupon validate, reviews"
```

(Adjust the `git add` paths if any of these test files don't already exist under that exact name — check first with `git status`.)

---

### Task 3: Apply to checkout/create-order + read-tier routes

**Files:**
- Modify: `apps/web/app/api/checkout/create-order/route.ts`
- Modify: `apps/web/app/api/search-suggestions/route.ts`
- Modify: `apps/web/app/api/frame-templates/[variantId]/route.ts`
- Modify (tests): each route's existing `.test.ts` file

Same pattern as Task 2, Step 1-4, with tiers: `checkout/create-order`→`checkout`, `search-suggestions`→`read`, `frame-templates/[variantId]`→`read`.

- [ ] **Step 1-2: Apply the import + first-line check + 429 test to all 3 routes**

(Identical mechanics to Task 2 Steps 1-2 — import `checkRateLimit`, add it as the first statement, add a 429 test per file matching that file's existing mock conventions.)

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @bro-pics/web test -- create-order search-suggestions frame-templates`
Expected: PASS, including the 3 new 429 tests.

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @bro-pics/web typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/checkout/create-order/route.ts apps/web/app/api/checkout/create-order/route.test.ts \
  apps/web/app/api/search-suggestions/route.ts apps/web/app/api/search-suggestions/route.test.ts \
  "apps/web/app/api/frame-templates/[variantId]/route.ts" "apps/web/app/api/frame-templates/[variantId]/route.test.ts"
git commit -m "feat(rate-limit): apply to checkout/create-order, search-suggestions, frame-templates"
```

---

### Task 4: Apply to all staff/admin routes

**Files:**
- Modify: `apps/web/app/api/staff/orders/route.ts`
- Modify: `apps/web/app/api/staff/orders/[orderNo]/route.ts`
- Modify: `apps/web/app/api/staff/orders/[orderNo]/advance/route.ts`
- Modify: `apps/web/app/api/staff/reviews/route.ts`
- Modify: `apps/web/app/api/staff/reviews/[id]/moderate/route.ts`
- Modify: `apps/web/app/api/admin/users/lookup/route.ts`
- Modify: `apps/web/app/api/admin/users/[uid]/role/route.ts`
- Modify (tests): each route's existing `.test.ts` file

All 7 routes use tier `staff`. Same pattern as Task 2 Steps 1-2.

- [ ] **Step 1-2: Apply the import + first-line check + 429 test to all 7 routes**

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @bro-pics/web test -- staff admin`
Expected: PASS, including the 7 new 429 tests.

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @bro-pics/web typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/staff apps/web/app/api/admin
git commit -m "feat(rate-limit): apply to all staff and admin routes"
```

---

### Task 5: Full verification and `PROJECT_STATUS.md` update

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Run the full test suite**

Run: `pnpm -r test`
Expected: every workspace passes, including all 14 new 429 tests and `rate-limit.test.ts`'s 6 tests (541 + 20 = 561 expected in `apps/web`, adjust if the actual pre-existing count differs — check the last recorded count in `PROJECT_STATUS.md` §4 first).

- [ ] **Step 2: Run typecheck across every workspace**

Run: `pnpm -r typecheck`
Expected: clean.

- [ ] **Step 3: Manual verification against a running dev server**

Start `pnpm --filter @bro-pics/web dev`. Pick one route (e.g. `search-suggestions`) and send more than its tier's `max` requests within `windowMs` (a small shell loop with `curl`, or the browser's fetch console) — confirm the `(max+1)`th response is a real 429 with a `Retry-After` header, then confirm it recovers (returns 200 again) after waiting past `windowMs`. This is the one thing unit tests with a fake clock can't fully prove: that the limiter behaves correctly against real wall-clock time and a real running server, not just mocked `Date.now()`.

- [ ] **Step 4: Update `PROJECT_STATUS.md`**

Add a new entry to §4 ("What exists in the repo right now") noting the rate limiter exists at `apps/web/lib/rate-limit.ts` and is applied to all 14 API routes. Add the accepted-limitation gap bullet to §5 exactly as described in the design doc's §5 (in-memory, per-instance, `max × instance-count` effective limit under horizontal scaling — a real but proportionate gap at this project's traffic target, not a broken feature). Update the test count.

- [ ] **Step 5: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: record API rate limiting completion in PROJECT_STATUS.md"
```

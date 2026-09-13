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

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

interface Bucket {
  count: number;
  windowStart: number;
}

// Keyed by `${tier}:${ip}` so one client's usage of different tiers is
// tracked independently. Entries are opportunistically overwritten the next
// time their own key is looked up after expiring, but a key that is never
// looked up again (e.g. an attacker rotating identities, or ordinary churn
// of distinct visitor IPs) would otherwise sit in the Map forever. To bound
// memory, checkRateLimit sweeps the whole Map and drops definitely-expired
// entries whenever the Map hits MAX_BUCKETS — see the sweep below. This is
// in-process, per-instance state: see the design doc §5 for the accepted
// multi-instance limitation.
const buckets = new Map<string, Bucket>();

// Safety cap on the number of tracked buckets. When hit, checkRateLimit
// sweeps and evicts entries whose window has definitely expired before
// doing anything else.
const MAX_BUCKETS = 10_000;

// Upper bound on how old a bucket can be while still possibly being live,
// regardless of which tier it belongs to — used by the sweep below so it
// doesn't need to parse the tier back out of each key.
const MAX_WINDOW_MS = Math.max(...Object.values(RATE_LIMITS).map((c) => c.windowMs));

function sweepExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= MAX_WINDOW_MS) {
      buckets.delete(key);
    }
  }
}

// Firebase App Hosting (this app's hosting target — Cloud Run behind a
// Fastly CDN and Google's load balancer) does NOT make `x-forwarded-for`
// trustworthy at any fixed position: the leftmost entry is whatever the
// client wrote, but the rightmost entry is a Fastly/Google proxy hop, not
// the browser — and the exact number of hops Firebase's own infrastructure
// appends has been observed to change without notice, so no fixed index
// into `x-forwarded-for` is reliable on this platform (confirmed via
// Firebase support, see https://arcjet.com/learn/detect-client-ip-firebase).
// Firebase App Hosting instead injects a dedicated `x-fah-client-ip` header
// carrying the real client IP directly — a client cannot forge this header
// to look platform-injected because it's only trusted here when
// `FIREBASE_CONFIG` (an env var only Firebase's own runtime sets, never
// attacker-controlled) confirms the request is actually running on App
// Hosting. Outside App Hosting (local dev, `pnpm dev`) `FIREBASE_CONFIG`
// isn't set, so this falls back to `x-forwarded-for`'s rightmost entry,
// which is fine for local testing where there's no untrusted proxy chain
// to worry about.
function getClientIp(request: Request): string {
  if (process.env.FIREBASE_CONFIG) {
    const fahClientIp = request.headers.get('x-fah-client-ip');
    if (fahClientIp) return fahClientIp.trim();
  }
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (!forwardedFor) return 'unknown';
  const parts = forwardedFor.split(',');
  const last = parts[parts.length - 1]?.trim();
  return last || 'unknown';
}

export function checkRateLimit(request: Request, tier: RateLimitTier): RateLimitResult {
  const config = RATE_LIMITS[tier];
  const ip = getClientIp(request);
  const key = `${tier}:${ip}`;
  const now = Date.now();

  if (buckets.size >= MAX_BUCKETS) {
    sweepExpiredBuckets(now);
  }

  // Fixed (tumbling) window: the count resets once windowMs has elapsed
  // since windowStart, rather than blending the current and previous
  // window like a true sliding window would. Accepted tradeoff at this
  // project's traffic scale — it permits up to a 2x burst right at a
  // window boundary (e.g. `max` requests just before the boundary and
  // `max` more just after), which is fine given the target of 500-1,000
  // visitors/day.
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

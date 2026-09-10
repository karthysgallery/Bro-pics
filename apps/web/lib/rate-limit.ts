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

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
    if (result.allowed) throw new Error('expected result.allowed to be false');
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

  it('keys by the rightmost x-forwarded-for entry (the trusted, proxy-appended real IP), not a client-forged leftmost one', () => {
    // Cloud Run appends the real client IP as the last hop, so a client
    // forging a different leftmost value on every request must not get a
    // fresh bucket each time — both requests below share the real IP
    // '10.0.0.1' in the rightmost position and must share one bucket.
    const reqA = makeRequest('203.0.113.99, 10.0.0.1');
    const reqB = makeRequest('198.51.100.7, 10.0.0.1');
    for (let i = 0; i < RATE_LIMITS.upload.max; i++) {
      checkRateLimit(reqA, 'upload');
    }
    expect(checkRateLimit(reqB, 'upload').allowed).toBe(false);
  });
});

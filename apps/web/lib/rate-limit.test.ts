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

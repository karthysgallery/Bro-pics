import { describe, it, expect, beforeEach } from 'vitest';
import { getOrCreateCheckoutIdempotencyKey, clearCheckoutIdempotencyKey } from './checkout-idempotency-key';

describe('checkout idempotency key', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('mints a key on first call', () => {
    const key = getOrCreateCheckoutIdempotencyKey();
    expect(key).toBeTruthy();
  });

  it('returns the SAME key on repeated calls (stable across retries)', () => {
    const first = getOrCreateCheckoutIdempotencyKey();
    const second = getOrCreateCheckoutIdempotencyKey();
    expect(second).toBe(first);
  });

  it('mints a fresh key after clearCheckoutIdempotencyKey', () => {
    const first = getOrCreateCheckoutIdempotencyKey();
    clearCheckoutIdempotencyKey();
    const second = getOrCreateCheckoutIdempotencyKey();
    expect(second).not.toBe(first);
  });
});

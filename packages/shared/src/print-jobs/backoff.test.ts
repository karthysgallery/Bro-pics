import { describe, it, expect } from 'vitest';
import { backoffMinutesAfterAttempt, printJobId, MAX_PRINT_JOB_ATTEMPTS } from './backoff';

describe('printJobId', () => {
  it('is deterministic for the same orderId/itemId pair', () => {
    expect(printJobId('order-1', 'item-1')).toBe('order-1_item-1');
    expect(printJobId('order-1', 'item-1')).toBe(printJobId('order-1', 'item-1'));
  });

  it('differs when either component differs', () => {
    expect(printJobId('order-1', 'item-1')).not.toBe(printJobId('order-1', 'item-2'));
    expect(printJobId('order-1', 'item-1')).not.toBe(printJobId('order-2', 'item-1'));
  });
});

describe('backoffMinutesAfterAttempt', () => {
  it('grows between successive attempts', () => {
    const delays = [1, 2, 3, 4].map((n) => backoffMinutesAfterAttempt(n));
    expect(delays).toEqual([1, 5, 15, 60]);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
    }
  });

  it('returns null once attempts are exhausted, signalling failed_permanent', () => {
    expect(backoffMinutesAfterAttempt(MAX_PRINT_JOB_ATTEMPTS)).toBeNull();
    expect(backoffMinutesAfterAttempt(MAX_PRINT_JOB_ATTEMPTS + 1)).toBeNull();
  });
});

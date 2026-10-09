import { describe, it, expect } from 'vitest';
import { shouldRelease } from './stock-release';

describe('shouldRelease', () => {
  it('releases only a cancelled order that still holds stock', () => {
    expect(shouldRelease({ status: 'cancelled', stockReservation: { status: 'held' } })).toBe(true);
    expect(shouldRelease({ status: 'cancelled', stockReservation: { status: 'released' } })).toBe(false);
    expect(shouldRelease({ status: 'cancelled' })).toBe(false);
    expect(shouldRelease({ status: 'payment_confirmed', stockReservation: { status: 'held' } })).toBe(false);
    expect(shouldRelease(undefined)).toBe(false);
  });
});

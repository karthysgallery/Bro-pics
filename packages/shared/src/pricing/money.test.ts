import { describe, it, expect } from 'vitest';
import { isValidPaise, assertPaise } from './money';

describe('isValidPaise', () => {
  it('accepts a non-negative integer', () => {
    expect(isValidPaise(99900)).toBe(true);
  });

  it('rejects a float', () => {
    expect(isValidPaise(999.5)).toBe(false);
  });

  it('rejects a negative number', () => {
    expect(isValidPaise(-100)).toBe(false);
  });
});

describe('assertPaise', () => {
  it('returns the value when valid', () => {
    expect(assertPaise(50000, 'subtotal')).toBe(50000);
  });

  it('throws with the field name when invalid', () => {
    expect(() => assertPaise(50.5, 'subtotal')).toThrow('subtotal must be a non-negative integer (paise), got 50.5');
  });
});

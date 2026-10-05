import { describe, it, expect } from 'vitest';
import { paiseToRupees, rupeesToPaise } from './admin-money';

describe('admin money helpers', () => {
  it('converts stored paise to editable rupees', () => {
    expect(paiseToRupees(79900)).toBe(799);
    expect(paiseToRupees(150)).toBe(1.5);
  });

  it('converts typed rupees to integer paise', () => {
    expect(rupeesToPaise(799)).toBe(79900);
    expect(rupeesToPaise('799')).toBe(79900);
    expect(rupeesToPaise('1499.50')).toBe(149950);
  });

  it('never produces a fractional paisa (float-safe)', () => {
    expect(rupeesToPaise('19.99')).toBe(1999);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    expect(Number.isInteger(rupeesToPaise('1234.567'))).toBe(true);
  });

  it('rejects blank, negative and non-numeric input instead of sending garbage', () => {
    expect(rupeesToPaise('')).toBeNull();
    expect(rupeesToPaise('   ')).toBeNull();
    expect(rupeesToPaise('abc')).toBeNull();
    expect(rupeesToPaise(-5)).toBeNull();
    expect(rupeesToPaise(NaN)).toBeNull();
  });

  it('round-trips the seed catalogue prices', () => {
    for (const paise of [79900, 149900, 99900, 5000]) {
      expect(rupeesToPaise(paiseToRupees(paise))).toBe(paise);
    }
  });
});

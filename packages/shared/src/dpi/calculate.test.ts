import { describe, it, expect } from 'vitest';
import { calculateEffectiveDpi, dpiTier } from './calculate';

describe('dpiTier', () => {
  it('returns green at or above 300 dpi', () => {
    expect(dpiTier(300)).toBe('green');
    expect(dpiTier(450)).toBe('green');
  });

  it('returns amber between 150 and 299 dpi', () => {
    expect(dpiTier(150)).toBe('amber');
    expect(dpiTier(299)).toBe('amber');
  });

  it('returns red below 150 dpi', () => {
    expect(dpiTier(149)).toBe('red');
    expect(dpiTier(0)).toBe('red');
  });
});

describe('calculateEffectiveDpi', () => {
  it('matches the spec reference table for an 8x12 print at full resolution, no zoom', () => {
    // Spec §13: 8x12in at 300 DPI requires 2400x3600px
    const result = calculateEffectiveDpi(2400, 3600, 1, 8, 12);
    expect(result.effectiveDpi).toBeCloseTo(300, 0);
    expect(result.tier).toBe('green');
  });

  it('halves effective dpi when the customer zooms in 2x', () => {
    const result = calculateEffectiveDpi(2400, 3600, 2, 8, 12);
    expect(result.effectiveDpi).toBeCloseTo(150, 0);
    expect(result.tier).toBe('amber');
  });

  it('flags a low-resolution upload as red', () => {
    const result = calculateEffectiveDpi(800, 1200, 1, 8, 12);
    expect(result.tier).toBe('red');
  });
});

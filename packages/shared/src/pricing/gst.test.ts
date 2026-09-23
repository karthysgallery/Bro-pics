import { describe, it, expect } from 'vitest';
import { splitGstFromInclusiveTotal } from './gst';

describe('splitGstFromInclusiveTotal', () => {
  it('splits a GST-inclusive total at 18% (105000 paise -> ~88983 taxable + ~16017 GST)', () => {
    const { taxableValuePaise, gstAmountPaise } = splitGstFromInclusiveTotal(105000, 18);
    expect(taxableValuePaise + gstAmountPaise).toBe(105000);
    expect(gstAmountPaise).toBeGreaterThan(0);
    expect(taxableValuePaise).toBeGreaterThan(0);
  });

  it('always sums back to the exact original total, for a range of rates and totals', () => {
    for (const total of [1, 99, 100000, 999999, 12345678]) {
      for (const rate of [5, 12, 18, 28]) {
        const { taxableValuePaise, gstAmountPaise } = splitGstFromInclusiveTotal(total, rate);
        expect(taxableValuePaise + gstAmountPaise).toBe(total);
      }
    }
  });

  it('returns the whole total as taxable with zero GST when rate is 0', () => {
    expect(splitGstFromInclusiveTotal(105000, 0)).toEqual({ taxableValuePaise: 105000, gstAmountPaise: 0 });
  });

  it('returns zero/zero for a zero total', () => {
    expect(splitGstFromInclusiveTotal(0, 18)).toEqual({ taxableValuePaise: 0, gstAmountPaise: 0 });
  });
});

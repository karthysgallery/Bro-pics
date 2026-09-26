import { describe, it, expect } from 'vitest';
import { deriveVariantPrintPixels } from './derive-print-pixels';

describe('deriveVariantPrintPixels', () => {
  it('multiplies inches by 300 DPI and rounds', () => {
    expect(deriveVariantPrintPixels(8, 10)).toEqual({ printWidthPx: 2400, printHeightPx: 3000, minUploadPx: 2400 });
  });

  it('rounds a fractional result', () => {
    // 4.5in * 300 = 1350 exactly; 6.33in * 300 = 1899 (rounded from 1899.0...)
    const result = deriveVariantPrintPixels(4.5, 6.33);
    expect(result.printWidthPx).toBe(1350);
    expect(result.printHeightPx).toBe(1899);
  });

  it('sets minUploadPx equal to printWidthPx', () => {
    const result = deriveVariantPrintPixels(12, 18);
    expect(result.minUploadPx).toBe(result.printWidthPx);
  });
});

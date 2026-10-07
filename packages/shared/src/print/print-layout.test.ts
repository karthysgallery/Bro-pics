import { describe, it, expect } from 'vitest';
import { legacyPrintArea, legacyPrintLayout, legacySlotDpi, legacyTemplatePrintWarnings, rectOnPaper, slotPrintSizeIn } from './print-layout';
import { dpiTier } from '../dpi/calculate';

// The live Classic Wooden Frame layout: one 2:3 slot in the middle of the square canvas.
const classic = {
  printableRects: [{ slotIndex: 0, x: 0.2333, y: 0.1, width: 0.5333, height: 0.8 }],
  textZones: [{ fieldKey: 'name', label: 'Name', x: 0.08, y: 0.84, width: 0.84, height: 0.065 }],
};

describe('legacyPrintLayout', () => {
  it('prints only the photo area, filling a 12x18 paper exactly with no stretching', () => {
    const layout = legacyPrintLayout(classic, { width: 12, height: 18 });
    expect(layout.area.x).toBeCloseTo(0.2333, 4);
    expect(layout.area.width).toBeCloseTo(0.5333, 4);
    expect(layout.area.height).toBeCloseTo(0.8, 6);
    expect(layout.unitsPerCanvas).toBeCloseTo(22.5, 1); // 18in / 0.8 of the canvas
    expect(layout.offsetX).toBeCloseTo(0, 1);
    expect(layout.offsetY).toBeCloseTo(0, 5);
    const onPaper = rectOnPaper(classic.printableRects[0]!, layout);
    expect(onPaper.width).toBeCloseTo(12, 1);
    expect(onPaper.height).toBeCloseTo(18, 5);
  });

  it('turns the paper to the design orientation and centres a different shape with even margins', () => {
    const square = { printableRects: [{ slotIndex: 0, x: 0.1, y: 0.1, width: 0.8, height: 0.8 }] };
    const layout = legacyPrintLayout(square, { width: 10, height: 8 });
    expect(layout.unitsPerCanvas).toBeCloseTo(10, 5); // 8in / 0.8
    expect(layout.offsetX).toBeCloseTo(1, 5);
    expect(layout.offsetY).toBeCloseTo(0, 5);
  });

  it('uses an explicit print area over the slot box', () => {
    expect(legacyPrintArea({ ...classic, printArea: { x: 0, y: 0, width: 1, height: 1 } })).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe('slot quality at its real printed size', () => {
  const variant = { widthIn: 12, heightIn: 18 };

  it('judges a photo by the slot it fills, not the whole frame', () => {
    // 3000x3000 photo cropped to 2:3 fills the 12x18 slot with 2000x3000 px.
    const result = legacySlotDpi({ template: classic, slot: classic.printableRects[0]!, variant, uploadWidthPx: 3000, uploadHeightPx: 3000, cropRect: { width: 2000, height: 3000 }, rotationDeg: 0 });
    expect(result.effectiveDpi).toBeCloseTo(166.7, 0);
    expect(result.tier).toBe('amber');
  });

  it('gives a small slot in a collage the higher DPI it really prints at', () => {
    const collage = { printableRects: [
      { slotIndex: 0, x: 0.1, y: 0.1, width: 0.36, height: 0.36 },
      { slotIndex: 1, x: 0.5, y: 0.1, width: 0.36, height: 0.36 },
      { slotIndex: 2, x: 0.1, y: 0.5, width: 0.76, height: 0.36 },
    ] };
    const layout = legacyPrintLayout(collage, { width: 10, height: 10 });
    const size = slotPrintSizeIn(collage.printableRects[0]!, layout);
    expect(size.widthIn).toBeCloseTo(4.74, 1);
    const result = legacySlotDpi({ template: collage, slot: collage.printableRects[0]!, variant: { widthIn: 10, heightIn: 10 }, uploadWidthPx: 1200, uploadHeightPx: 1200, cropRect: { width: 1200, height: 1200 }, rotationDeg: 0 });
    // Measured against the whole 10in frame this would be 120 DPI (blocked); the slot prints ~4.7in wide.
    expect(result.effectiveDpi).toBeCloseTo(253, 0);
    expect(result.tier).toBe('amber');
  });

  it('applies each slot’s own requirement', () => {
    const strict = { ...classic.printableRects[0]!, minDpi: 200, recommendedDpi: 400 };
    const result = legacySlotDpi({ template: { printableRects: [strict] }, slot: strict, variant, uploadWidthPx: 3000, uploadHeightPx: 3000, cropRect: { width: 2000, height: 3000 }, rotationDeg: 0 });
    expect(result.tier).toBe('red');
    expect(dpiTier(166.7)).toBe('amber');
  });

  it('uses the slot’s own millimetre size when given', () => {
    const slot = { ...classic.printableRects[0]!, widthMm: 101.6, heightMm: 152.4 };
    const size = slotPrintSizeIn(slot, legacyPrintLayout(classic, { width: 12, height: 18 }));
    expect(size.widthIn).toBeCloseTo(4, 6);
    expect(size.heightIn).toBeCloseTo(6, 6);
  });

  it('swaps the slot axes when the photo is rotated 90 degrees', () => {
    const result = legacySlotDpi({ template: classic, slot: classic.printableRects[0]!, variant, uploadWidthPx: 3000, uploadHeightPx: 2000, cropRect: { width: 3000, height: 2000 }, rotationDeg: 90 });
    expect(result.effectiveDpi).toBeCloseTo(166.7, 0); // 3000px across the 18in side, 2000px across the 12in side
  });
});

describe('legacyTemplatePrintWarnings', () => {
  it('flags text that would not be printed and shape mismatches', () => {
    const warnings = legacyTemplatePrintWarnings(classic, { widthIn: 12, heightIn: 18 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Text “Name” is outside the printed area/);
    const square = { printableRects: [{ slotIndex: 0, x: 0.1, y: 0.1, width: 0.8, height: 0.8 }] };
    expect(legacyTemplatePrintWarnings(square, { widthIn: 8, heightIn: 10 })[0]).toMatch(/white margins/);
  });
});

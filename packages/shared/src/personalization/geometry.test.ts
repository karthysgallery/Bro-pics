import { describe, it, expect } from 'vitest';
import {
  canvasPrintWidthIn, clampScale, clampTransform, cropRectInOriginalPx, effectiveDpi, fitPhotoToSlot, rectToOriginalSpace, rectToRotatedSpace,
  rotatedSize, slotAspectRatio, slotRectPx, transformFromVisibleRegion, visibleRegion, MAX_SCALE,
} from './geometry';
import { complexCollageTemplate, singlePhotoTemplate, threePhotoTemplate } from './test-fixtures';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
const ROTATIONS = [0, 90, 180, 270] as const;

describe('slot geometry', () => {
  it('converts fractions to pixels for any canvas size (editor 400px and print 2400px agree proportionally)', () => {
    const slot = singlePhotoTemplate.photoSlots[0];
    expect(slotRectPx(slot, 400, 600)).toEqual({ x: 40, y: 60, width: 320, height: 480 });
    expect(slotRectPx(slot, 2400, 3600)).toEqual({ x: 240, y: 360, width: 1920, height: 2880 });
  });

  it('computes the slot aspect ratio from BOTH axes of the canvas', () => {
    const slot = threePhotoTemplate.photoSlots[0]; // 0.28 x 0.6 of a 3600x2400 canvas
    close(slotAspectRatio(slot, threePhotoTemplate.canvas), (0.28 * 3600) / (0.6 * 2400));
  });
});

describe('automatic photo fit', () => {
  it.each([
    ['landscape photo in a portrait slot', 4000, 3000, 0.75],
    ['portrait photo in a landscape slot', 3000, 4000, 1.5],
    ['square photo in a wide slot', 2000, 2000, 2],
    ['panorama in a square slot', 8000, 2000, 1],
  ])('%s: covers the slot exactly, centred, never stretched', (_name, w, h, aspect) => {
    const region = visibleRegion(w, h, 0, aspect, fitPhotoToSlot());
    // Same aspect as the slot => no distortion.
    close(region.width / region.height, aspect);
    // Fully inside the photo => no empty areas.
    expect(region.x).toBeGreaterThanOrEqual(-1e-6);
    expect(region.y).toBeGreaterThanOrEqual(-1e-6);
    expect(region.x + region.width).toBeLessThanOrEqual(w + 1e-6);
    expect(region.y + region.height).toBeLessThanOrEqual(h + 1e-6);
    // Centred.
    close(region.x + region.width / 2, w / 2);
    close(region.y + region.height / 2, h / 2);
    // And it uses the whole extent on the limiting axis.
    expect(Math.max(region.width / w, region.height / h)).toBeCloseTo(1, 6);
  });
});

describe('zoom and pan', () => {
  it('zooming in shows a proportionally smaller region', () => {
    const base = visibleRegion(4000, 3000, 0, 1, { scale: 1, offsetX: 0, offsetY: 0 });
    const zoomed = visibleRegion(4000, 3000, 0, 1, { scale: 2, offsetX: 0, offsetY: 0 });
    close(zoomed.width, base.width / 2);
    close(zoomed.height, base.height / 2);
  });

  it('panning moves the visible window the opposite way to the photo', () => {
    const centred = visibleRegion(4000, 3000, 0, 1, { scale: 2, offsetX: 0, offsetY: 0 });
    const photoRight = visibleRegion(4000, 3000, 0, 1, { scale: 2, offsetX: 0.2, offsetY: 0 });
    expect(photoRight.x).toBeLessThan(centred.x); // photo dragged right => we now see its left part
  });

  it('never lets the customer drag the photo far enough to expose empty slot area', () => {
    for (const rotation of ROTATIONS) {
      for (const scale of [1, 1.5, 3]) {
        const region = visibleRegion(4000, 3000, rotation, 1, { scale, offsetX: 99, offsetY: -99 });
        const { width, height } = rotatedSize(4000, 3000, rotation);
        expect(region.x).toBeGreaterThanOrEqual(-1e-6);
        expect(region.y).toBeGreaterThanOrEqual(-1e-6);
        expect(region.x + region.width).toBeLessThanOrEqual(width + 1e-6);
        expect(region.y + region.height).toBeLessThanOrEqual(height + 1e-6);
      }
    }
  });

  it('clamps zoom to the allowed range and survives NaN/Infinity', () => {
    expect(clampScale(0.2)).toBe(1);
    expect(clampScale(100)).toBe(MAX_SCALE);
    expect(clampScale(NaN)).toBe(1);
    const t = clampTransform({ scale: Infinity, offsetX: NaN, offsetY: Infinity }, 4000, 3000, 1);
    expect(Number.isFinite(t.scale) && Number.isFinite(t.offsetX) && Number.isFinite(t.offsetY)).toBe(true);
  });

  it('at 1x, a cover-fit photo cannot be panned along the axis it exactly fills', () => {
    const t = clampTransform({ scale: 1, offsetX: 0.4, offsetY: 0.4 }, 3000, 3000, 1); // square in square: no slack at all
    expect(t.offsetX).toBeCloseTo(0, 9);
    expect(t.offsetY).toBeCloseTo(0, 9);
  });
});

describe('rotation mapping (what the print renderer crops from the ORIGINAL photo)', () => {
  const rect = { x: 120, y: 40, width: 300, height: 200 };
  it.each(ROTATIONS)('rotated-space -> original-space -> rotated-space is lossless at %i°', (rotation) => {
    const orig = rectToOriginalSpace(rect, 1000, 700, rotation);
    const back = rectToRotatedSpace(orig, 1000, 700, rotation);
    close(back.x, rect.x); close(back.y, rect.y); close(back.width, rect.width); close(back.height, rect.height);
  });

  it.each(ROTATIONS)('maps individual pixels consistently at %i° (the rect corners land on the right original pixels)', (rotation) => {
    const W = 1000, H = 700;
    // Forward definition of "rotate clockwise by `rotation`": where does original pixel (xo,yo) end up?
    const forward = (xo: number, yo: number) => {
      switch (rotation) {
        case 0: return { x: xo, y: yo };
        case 90: return { x: H - yo, y: xo };
        case 180: return { x: W - xo, y: H - yo };
        case 270: return { x: yo, y: W - xo };
      }
    };
    const orig = rectToOriginalSpace(rect, W, H, rotation);
    const corners = [[orig.x, orig.y], [orig.x + orig.width, orig.y], [orig.x, orig.y + orig.height], [orig.x + orig.width, orig.y + orig.height]];
    const mapped = corners.map(([x, y]) => forward(x, y));
    const xs = mapped.map((p) => p.x), ys = mapped.map((p) => p.y);
    close(Math.min(...xs), rect.x); close(Math.max(...xs), rect.x + rect.width);
    close(Math.min(...ys), rect.y); close(Math.max(...ys), rect.y + rect.height);
  });

  it('the original-space crop has the slot aspect only when un-rotated; at 90/270 its axes are swapped', () => {
    const c0 = cropRectInOriginalPx(4000, 3000, 0, 1.5, { scale: 1, offsetX: 0, offsetY: 0 });
    const c90 = cropRectInOriginalPx(4000, 3000, 90, 1.5, { scale: 1, offsetX: 0, offsetY: 0 });
    close(c0.width / c0.height, 1.5);
    close(c90.height / c90.width, 1.5);
  });
});

describe('transform <-> visible region', () => {
  it.each(ROTATIONS)('recovering the transform from a saved region reproduces the same region (rotation %i°)', (rotation) => {
    const aspect = 0.8;
    const t = { scale: 2.2, offsetX: 0.07, offsetY: -0.05 };
    const region = visibleRegion(4032, 3024, rotation, aspect, t);
    const recovered = transformFromVisibleRegion(region, 4032, 3024, rotation, aspect);
    const again = visibleRegion(4032, 3024, rotation, aspect, recovered);
    close(again.x, region.x, 1e-4); close(again.y, region.y, 1e-4);
    close(again.width, region.width, 1e-4); close(again.height, region.height, 1e-4);
  });
});

describe('effective DPI', () => {
  it('is source pixels across the slot / printed inches: a 6000px-wide region in a 8in slot = 750 dpi', () => {
    const slot = { width: 0.8, widthMm: undefined };
    const canvas = { width: 2400, dpi: 300 }; // slot = 0.8*2400/300 = 6.4in
    close(effectiveDpi({ x: 0, y: 0, width: 1920, height: 100 }, slot, canvas), 300);
  });

  it('zooming in lowers the DPI (fewer source pixels spread over the same print area)', () => {
    const slot = singlePhotoTemplate.photoSlots[0];
    const aspect = slotAspectRatio(slot, singlePhotoTemplate.canvas);
    const dpiAt = (scale: number) => effectiveDpi(visibleRegion(3000, 3000, 0, aspect, { scale, offsetX: 0, offsetY: 0 }), slot, singlePhotoTemplate.canvas);
    expect(dpiAt(2)).toBeLessThan(dpiAt(1));
    close(dpiAt(2), dpiAt(1) / 2, 1e-6);
  });

  it('uses the slot\'s explicit physical size when the template gives one', () => {
    const dpi = effectiveDpi({ x: 0, y: 0, width: 1000, height: 1000 }, { width: 0.5, widthMm: 50.8 }, { width: 6000, dpi: 300 });
    close(dpi, 500); // 50.8mm = 2in
  });

  it('works for the small slots of a 29-slot collage', () => {
    const small = complexCollageTemplate.photoSlots[5];
    expect(effectiveDpi({ x: 0, y: 0, width: 1500, height: 1500 }, small, complexCollageTemplate.canvas)).toBeGreaterThan(0);
  });
});

describe('canvasPrintWidthIn', () => {
  const canvas = { width: 2400, height: 3600, dpi: 300 }; // drawn at 8 × 12 in

  it('is the canvas’s own size without a frame size', () => {
    expect(canvasPrintWidthIn(canvas)).toBe(8);
  });

  it('follows the frame being bought, turned to the canvas orientation', () => {
    expect(canvasPrintWidthIn(canvas, { width: 12, height: 18 })).toBe(12);
    expect(canvasPrintWidthIn(canvas, { width: 18, height: 12 })).toBe(12);
  });

  it('fits a canvas with other proportions inside the frame', () => {
    expect(canvasPrintWidthIn({ width: 3000, height: 3000, dpi: 300 }, { width: 8, height: 12 })).toBe(8);
    expect(canvasPrintWidthIn({ width: 3000, height: 1000, dpi: 300 }, { width: 12, height: 12 })).toBe(12);
  });

  it('halves the DPI when the same collage is printed twice as wide', () => {
    const slot = { width: 0.5 };
    const region = { x: 0, y: 0, width: 1200, height: 1200 };
    expect(effectiveDpi(region, slot, canvas)).toBe(300);
    expect(effectiveDpi(region, slot, canvas, { width: 16, height: 24 })).toBe(150);
  });
});

import { framingForSubject as frame } from './geometry';
describe('framingForSubject', () => {
  it('zooms in on the people of a cut-out and centres them, still covering the slot', () => {
    // A 2400×3600 cut-out; the couple occupy the middle 30% × 60%. Portrait slot (0.8).
    const t = frame(2400, 3600, 0.8, { x: 0.35, y: 0.3, width: 0.3, height: 0.6 });
    const region = visibleRegion(2400, 3600, 0, 0.8, t);
    // Height-limited: the couple (60% of the height, plus a little room) fills the slot top to bottom.
    // The cover fit already shows 2400×3000 of the photo, so the zoom is 3000 / (2160 × 1.08).
    expect(t.scale).toBeCloseTo(3000 / (0.6 * 3600 * 1.08), 2);
    // The whole couple is inside what is shown…
    expect(region.x).toBeLessThanOrEqual(0.35 * 2400);
    expect(region.x + region.width).toBeGreaterThanOrEqual(0.65 * 2400);
    expect(region.y).toBeLessThanOrEqual(0.3 * 3600);
    expect(region.y + region.height).toBeGreaterThanOrEqual(0.9 * 3600 - 1);
    // …and the window never leaves the photo.
    expect(region.x).toBeGreaterThanOrEqual(0);
    expect(region.y + region.height).toBeLessThanOrEqual(3600 + 1e-6);
  });

  it('keeps the plain cover fit when the subject already fills the photo, or the box is empty', () => {
    expect(frame(2000, 3000, 0.7, { x: 0, y: 0, width: 1, height: 1 }).scale).toBe(1);
    expect(frame(2000, 3000, 0.7, { x: 0, y: 0, width: 0, height: 0 })).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
});

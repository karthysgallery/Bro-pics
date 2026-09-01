import { describe, it, expect } from 'vitest';
import { fractionRectToCanvasRect, coverScale, centeredOffset, slotCropRectInOriginalPx } from './editor-geometry';

describe('fractionRectToCanvasRect', () => {
  it('converts a centered fraction rect to canvas pixel coordinates', () => {
    const result = fractionRectToCanvasRect({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, 800, 800);
    expect(result).toEqual({ x: 80, y: 80, width: 640, height: 640 });
  });

  it('handles a non-square canvas', () => {
    const result = fractionRectToCanvasRect({ x: 0, y: 0, width: 0.5, height: 1 }, 1000, 500);
    expect(result).toEqual({ x: 0, y: 0, width: 500, height: 500 });
  });

  it('handles an off-center rect', () => {
    const result = fractionRectToCanvasRect({ x: 0.55, y: 0.05, width: 0.4, height: 0.4 }, 800, 800);
    expect(result).toEqual({ x: 440, y: 40, width: 320, height: 320 });
  });
});

describe('coverScale', () => {
  it('picks the larger ratio so the image fully covers the slot', () => {
    // slot 160x160, image 2000x1000 -> width ratio 0.08, height ratio 0.16
    expect(coverScale(160, 160, 2000, 1000)).toBeCloseTo(0.16);
  });

  it('handles a portrait image against a landscape slot', () => {
    // slot 300x160, image 1000x2000 -> width ratio 0.3, height ratio 0.08
    expect(coverScale(300, 160, 1000, 2000)).toBeCloseTo(0.3);
  });
});

describe('centeredOffset', () => {
  it('centers an image that overflows the slot on one axis (negative offset)', () => {
    // slot 160x160, image 2000x1000, scale 0.16 -> displayed 320x160
    const result = centeredOffset(160, 160, 2000, 1000, 0.16);
    expect(result.offsetX).toBeCloseTo(-80);
    expect(result.offsetY).toBeCloseTo(0);
  });
});

describe('slotCropRectInOriginalPx', () => {
  it('recovers the full image when scale/offset match a no-op cover fit', () => {
    // slot 160x160, image 160x160 (already exact fit), scale 1, no offset
    const result = slotCropRectInOriginalPx(160, 160, 1, 0, 0);
    expect(result).toEqual({ x: -0, y: -0, width: 160, height: 160 });
  });

  it('width/height depend only on scale; position shifts with offset', () => {
    // slot 160x160, scale 0.16 -> 1000px of original per axis
    const centered = slotCropRectInOriginalPx(160, 160, 0.16, -80, 0);
    expect(centered.width).toBeCloseTo(1000);
    expect(centered.height).toBeCloseTo(1000);
    expect(centered.x).toBeCloseTo(500); // -(-80)/0.16
    expect(centered.y).toBeCloseTo(0);

    const dragged = slotCropRectInOriginalPx(160, 160, 0.16, -160, -16);
    expect(dragged.width).toBeCloseTo(1000);
    expect(dragged.height).toBeCloseTo(1000);
    expect(dragged.x).toBeCloseTo(1000);
    expect(dragged.y).toBeCloseTo(100);
  });
});

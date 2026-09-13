import { describe, it, expect } from 'vitest';
import {
  fractionRectToCanvasRect,
  coverScale,
  centeredOffset,
  slotCropRectInOriginalPx,
  coverScaleForRotation,
  centeredOffsetForRotation,
  offsetAfterScaleChange,
} from './editor-geometry';

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

  // Konva rotates a node clockwise about its own (x, y) — the slot
  // top-left + offset, i.e. BEFORE the image's own extent is considered —
  // not about the image's center. These cases hand-trace that geometry for
  // a non-square 200x100 slot at scale 1, so a swapped width/height at
  // 90/270 is obvious rather than hidden by a square slot.
  describe('rotation-aware crop (Finding 8)', () => {
    it('0deg matches the original (non-rotated) formula', () => {
      const result = slotCropRectInOriginalPx(200, 100, 1, 0, 0, 0);
      expect(result).toEqual({ x: -0, y: -0, width: 200, height: 100 });
    });

    it('90deg (no offset): swaps which slot axis constrains width vs height', () => {
      // Hand-traced: canvasRel = (-v, u) at scale 1 with offset (0,0).
      // canvasRel_x in [0,200] (slotWidth) => v in [-200,0] => y=-200, height=200.
      // canvasRel_y in [0,100] (slotHeight) => u in [0,100] => x=0, width=100.
      const result = slotCropRectInOriginalPx(200, 100, 1, 0, 0, 90);
      expect(result).toEqual({ x: -0, y: -200, width: 100, height: 200 });
    });

    it('180deg: mirrors both axes through the offset', () => {
      const result = slotCropRectInOriginalPx(200, 100, 1, 50, 20, 180);
      // x = (offsetX - slotW)/scale = (50-200)/1 = -150
      // y = (offsetY - slotH)/scale = (20-100)/1 = -80
      expect(result).toEqual({ x: -150, y: -80, width: 200, height: 100 });
    });

    it('270deg (with a non-zero offset): swapped extents, hand-traced', () => {
      // canvasRel = (offsetX + v, offsetY - u) = (50+v, 20-u) at scale 1.
      // canvasRel_x in [0,200] => v in [-50,150] => y=-50, height=200.
      // canvasRel_y in [0,100] => u in [-80,20] => x=-80, width=100.
      const result = slotCropRectInOriginalPx(200, 100, 1, 50, 20, 270);
      expect(result).toEqual({ x: -80, y: -50, width: 100, height: 200 });
    });

    it('90/270 crop dimensions match a directly-rotated 0deg equivalent for a square slot', () => {
      // For a SQUARE slot with no offset, rotating 90/180/270 should not
      // change the crop rect's width/height (only 0/0 offset symmetry
      // makes position match too) — a useful cross-check independent of
      // the hand-traced non-square cases above.
      const base = slotCropRectInOriginalPx(160, 160, 0.5, 0, 0, 0);
      const rot90 = slotCropRectInOriginalPx(160, 160, 0.5, 0, 0, 90);
      const rot180 = slotCropRectInOriginalPx(160, 160, 0.5, 0, 0, 180);
      const rot270 = slotCropRectInOriginalPx(160, 160, 0.5, 0, 0, 270);
      expect(rot90.width).toBeCloseTo(base.height);
      expect(rot90.height).toBeCloseTo(base.width);
      expect(rot180.width).toBeCloseTo(base.width);
      expect(rot180.height).toBeCloseTo(base.height);
      expect(rot270.width).toBeCloseTo(base.height);
      expect(rot270.height).toBeCloseTo(base.width);
    });
  });
});

describe('coverScaleForRotation', () => {
  it('matches coverScale unchanged at 0/180deg', () => {
    expect(coverScaleForRotation(160, 160, 2000, 1000, 0)).toBeCloseTo(coverScale(160, 160, 2000, 1000));
    expect(coverScaleForRotation(160, 160, 2000, 1000, 180)).toBeCloseTo(coverScale(160, 160, 2000, 1000));
  });

  it('swaps the image dimensions at 90/270deg (a sideways-drawn image)', () => {
    // slot 300x160 (landscape), image 1000x2000 (portrait, natural px).
    // Rotated 90/270, the image is drawn sideways, so its EFFECTIVE
    // footprint against the slot is 2000(w) x 1000(h) — matches
    // coverScale(300,160, 2000,1000) rather than the un-rotated call.
    expect(coverScaleForRotation(300, 160, 1000, 2000, 90)).toBeCloseTo(coverScale(300, 160, 2000, 1000));
    expect(coverScaleForRotation(300, 160, 1000, 2000, 270)).toBeCloseTo(coverScale(300, 160, 2000, 1000));
  });
});

describe('centeredOffsetForRotation', () => {
  it('matches centeredOffset unchanged at 0deg', () => {
    const result = centeredOffsetForRotation(160, 160, 2000, 1000, 0.16, 0);
    const expected = centeredOffset(160, 160, 2000, 1000, 0.16);
    expect(result.offsetX).toBeCloseTo(expected.offsetX);
    expect(result.offsetY).toBeCloseTo(expected.offsetY);
  });

  it('the resulting offset, fed back through slotCropRectInOriginalPx, centers the crop on the image for each rotation', () => {
    // For a symmetric square image and slot, a centered fit's crop rect
    // should have the same width/height as the image itself (nothing
    // cropped off) and be positioned at the image's own origin — this
    // should hold regardless of rotation, since centering is agnostic to
    // orientation for a square image in a square slot.
    const slotSize = 160;
    const imgSize = 160;
    const scale = 1;
    for (const rotationDeg of [0, 90, 180, 270] as const) {
      const { offsetX, offsetY } = centeredOffsetForRotation(slotSize, slotSize, imgSize, imgSize, scale, rotationDeg);
      const crop = slotCropRectInOriginalPx(slotSize, slotSize, scale, offsetX, offsetY, rotationDeg);
      expect(crop.width).toBeCloseTo(imgSize);
      expect(crop.height).toBeCloseTo(imgSize);
      expect(crop.x).toBeCloseTo(0);
      expect(crop.y).toBeCloseTo(0);
    }
  });
});

describe('offsetAfterScaleChange', () => {
  it('returns the same offset when scale does not change', () => {
    const result = offsetAfterScaleChange(-40, -20, 0.5, 0.5, 160, 160);
    expect(result.offsetX).toBeCloseTo(-40);
    expect(result.offsetY).toBeCloseTo(-20);
  });

  it('keeps the slot-center point fixed in original-image space when zooming in', () => {
    const slotSize = 160;
    const oldScale = 0.5;
    const newScale = 1.0;
    const offsetX = -20;
    const offsetY = -10;

    const before = slotCropRectInOriginalPx(slotSize, slotSize, oldScale, offsetX, offsetY, 0);
    const centerU = before.x + before.width / 2;
    const centerV = before.y + before.height / 2;

    const after = offsetAfterScaleChange(offsetX, offsetY, oldScale, newScale, slotSize, slotSize);
    const afterCrop = slotCropRectInOriginalPx(slotSize, slotSize, newScale, after.offsetX, after.offsetY, 0);
    const afterCenterU = afterCrop.x + afterCrop.width / 2;
    const afterCenterV = afterCrop.y + afterCrop.height / 2;

    expect(afterCenterU).toBeCloseTo(centerU);
    expect(afterCenterV).toBeCloseTo(centerV);
  });
});

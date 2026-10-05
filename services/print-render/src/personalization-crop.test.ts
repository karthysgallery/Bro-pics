import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { cropRectInOriginalPx, visibleRegion, type Rotation } from '@bro-pics/shared';
import { renderSlotPhoto } from './render-slot';

/**
 * Cross-check: the personalization engine decides WHAT part of the photo is
 * visible (a transform); the print renderer cuts it. If those two ever disagree,
 * customers get a print that differs from what they approved. Here every pixel of
 * a synthetic photo encodes its own (x, y) in its colour, so we can read off
 * exactly which source pixel ended up where in the rendered slot.
 */
const W = 600;
const H = 400;

async function coordinatePhoto(): Promise<Buffer> {
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      raw[i] = Math.round((x / (W - 1)) * 255); // R encodes x
      raw[i + 1] = Math.round((y / (H - 1)) * 255); // G encodes y
      raw[i + 2] = 0;
    }
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

async function pixel(buffer: Buffer, x: number, y: number): Promise<[number, number]> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (Math.min(y, info.height - 1) * info.width + Math.min(x, info.width - 1)) * info.channels;
  return [data[i], data[i + 1]];
}

const toSource = ([r, g]: [number, number]) => ({ x: (r / 255) * (W - 1), y: (g / 255) * (H - 1) });

// Where rotation moves an ORIGINAL pixel in the rendered slot (clockwise), used to predict corners.
function forward(rotation: Rotation, xo: number, yo: number) {
  switch (rotation) {
    case 0: return { x: xo, y: yo };
    case 90: return { x: H - yo, y: xo };
    case 180: return { x: W - xo, y: H - yo };
    case 270: return { x: yo, y: W - xo };
  }
}

describe.each([0, 90, 180, 270] as const)('engine crop vs real Sharp renderer at %i°', (rotation) => {
  const slotAspect = 0.75; // portrait slot
  const transform = { scale: 2, offsetX: 0.12, offsetY: -0.08 };
  const targetW = 150;
  const targetH = Math.round(targetW / slotAspect);

  it('the rendered slot centre is the centre of the region the engine says is visible', async () => {
    const photo = await coordinatePhoto();
    const crop = cropRectInOriginalPx(W, H, rotation, slotAspect, transform);
    const rendered = await renderSlotPhoto({ photoBuffer: photo, cropRect: crop, rotationDeg: rotation, targetWidthPx: targetW, targetHeightPx: targetH });
    const src = toSource(await pixel(rendered, Math.round(targetW / 2), Math.round(targetH / 2)));
    expect(Math.abs(src.x - (crop.x + crop.width / 2))).toBeLessThan(W * 0.012);
    expect(Math.abs(src.y - (crop.y + crop.height / 2))).toBeLessThan(H * 0.012);
  });

  it('the rendered slot corners are the right corners of the visible region', async () => {
    const photo = await coordinatePhoto();
    const crop = cropRectInOriginalPx(W, H, rotation, slotAspect, transform);
    const rendered = await renderSlotPhoto({ photoBuffer: photo, cropRect: crop, rotationDeg: rotation, targetWidthPx: targetW, targetHeightPx: targetH });
    // Predict each rendered corner by rotating the four ORIGINAL-space crop corners forward, then pairing by position.
    const corners = [
      { name: 'top-left', px: [2, 2] },
      { name: 'bottom-right', px: [targetW - 3, targetH - 3] },
    ] as const;
    const region = visibleRegion(W, H, rotation, slotAspect, transform); // in rotated space
    const rotatedCorner = (name: string) => (name === 'top-left' ? { x: region.x, y: region.y } : { x: region.x + region.width, y: region.y + region.height });
    for (const corner of corners) {
      const src = toSource(await pixel(rendered, corner.px[0], corner.px[1]));
      const expectedRotated = rotatedCorner(corner.name);
      // Find which original pixel maps (clockwise by `rotation`) to that rotated-space point.
      const candidates = [
        { x: src.x, y: src.y },
      ].map((c) => forward(rotation, c.x, c.y));
      expect(Math.abs(candidates[0].x - expectedRotated.x)).toBeLessThan(W * 0.03);
      expect(Math.abs(candidates[0].y - expectedRotated.y)).toBeLessThan(W * 0.03);
    }
  });

  it('the rendered output has exactly the slot size (no stretching, aspect preserved)', async () => {
    const photo = await coordinatePhoto();
    const crop = cropRectInOriginalPx(W, H, rotation, slotAspect, transform);
    const rendered = await renderSlotPhoto({ photoBuffer: photo, cropRect: crop, rotationDeg: rotation, targetWidthPx: targetW, targetHeightPx: targetH });
    const meta = await sharp(rendered).metadata();
    expect([meta.width, meta.height]).toEqual([targetW, targetH]);
  });
});

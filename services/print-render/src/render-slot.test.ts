import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { renderSlotPhoto } from './render-slot';

/** An 8x8 RGBA test photo with a distinct, solid-color quadrant, so
 * rotation/crop/resize behavior is visible in the output pixels — big
 * enough that sample points can sit well clear of the resize kernel's
 * interpolation zone at the seams between quadrants. */
async function makeMarkerPhoto(): Promise<Buffer> {
  const red = [255, 0, 0, 255];
  const green = [0, 255, 0, 255];
  const blue = [0, 0, 255, 255];
  const yellow = [255, 255, 0, 255];
  const pixels: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const color = x < 4 ? (y < 4 ? red : blue) : y < 4 ? green : yellow;
      pixels.push(...color);
    }
  }
  return sharp(Buffer.from(pixels), { raw: { width: 8, height: 8, channels: 4 } }).png().toBuffer();
}

async function pixelAt(buffer: Buffer, x: number, y: number): Promise<[number, number, number, number]> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

const RED: [number, number, number, number] = [255, 0, 0, 255];
const GREEN: [number, number, number, number] = [0, 255, 0, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];
const YELLOW: [number, number, number, number] = [255, 255, 0, 255];

describe('renderSlotPhoto', () => {
  it('extracts the full photo and resizes to the target size with no rotation', async () => {
    const photoBuffer = await makeMarkerPhoto();
    const result = await renderSlotPhoto({
      photoBuffer,
      cropRect: { x: 0, y: 0, width: 8, height: 8 },
      rotationDeg: 0,
      targetWidthPx: 16,
      targetHeightPx: 16,
    });
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(16);
    expect(meta.height).toBe(16);
    // Sampled well inside each quadrant, clear of the resize kernel's
    // interpolation zone at the seams.
    expect(await pixelAt(result, 4, 4)).toEqual(RED); // top-left quadrant
    expect(await pixelAt(result, 12, 4)).toEqual(GREEN); // top-right quadrant
    expect(await pixelAt(result, 4, 12)).toEqual(BLUE); // bottom-left quadrant
    expect(await pixelAt(result, 12, 12)).toEqual(YELLOW); // bottom-right quadrant
  });

  it('rotates 90 degrees clockwise, matching the client canvas convention', async () => {
    const photoBuffer = await makeMarkerPhoto();
    const result = await renderSlotPhoto({
      photoBuffer,
      cropRect: { x: 0, y: 0, width: 8, height: 8 },
      rotationDeg: 90,
      targetWidthPx: 16,
      targetHeightPx: 16,
    });
    // A 90-degree clockwise rotation moves the top-left content to the
    // top-right, top-right to bottom-right, bottom-right to bottom-left,
    // bottom-left to top-left (verified against sharp's own rotate()
    // behavior directly, not assumed — see the render-slot geometry note).
    expect(await pixelAt(result, 12, 4)).toEqual(RED); // was top-left, now top-right
    expect(await pixelAt(result, 12, 12)).toEqual(GREEN); // was top-right, now bottom-right
    expect(await pixelAt(result, 4, 4)).toEqual(BLUE); // was bottom-left, now top-left
    expect(await pixelAt(result, 4, 12)).toEqual(YELLOW); // was bottom-right, now bottom-left
  });

  it('extracts a sub-region of the photo (a real crop, not the whole image)', async () => {
    const photoBuffer = await makeMarkerPhoto();
    const result = await renderSlotPhoto({
      photoBuffer,
      cropRect: { x: 0, y: 0, width: 4, height: 4 }, // just the top-left (red) quadrant
      rotationDeg: 0,
      targetWidthPx: 8,
      targetHeightPx: 8,
    });
    expect(await pixelAt(result, 2, 2)).toEqual(RED);
    expect(await pixelAt(result, 6, 2)).toEqual(RED); // resized — the whole output is red
    expect(await pixelAt(result, 2, 6)).toEqual(RED);
  });

  it('pads with transparent pixels when cropRect extends outside the photo bounds, instead of erroring', async () => {
    const photoBuffer = await makeMarkerPhoto();
    // Crop rect starts 2px before the photo's left edge and extends 2px
    // past its right edge (photo is 8 wide) — a customer who zoomed out /
    // dragged the photo off-center. Must not throw (sharp's raw .extract()
    // would).
    const result = await renderSlotPhoto({
      photoBuffer,
      cropRect: { x: -2, y: 0, width: 12, height: 8 },
      rotationDeg: 0,
      targetWidthPx: 12,
      targetHeightPx: 8,
    });
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(12);
    expect(meta.height).toBe(8);
    // The leftmost padded, transparent region — the real photo content
    // starts a couple pixels in.
    const [, , , alphaAtEdge] = await pixelAt(result, 0, 4);
    expect(alphaAtEdge).toBe(0);
  });

  it('applies the mask via dest-in, making the masked-out area transparent', async () => {
    const photoBuffer = await makeMarkerPhoto();
    // A mask that's opaque on the left half, transparent on the right half.
    const maskRaw = Buffer.from([
      255, 255, 255, 255, 0, 0, 0, 0,
      255, 255, 255, 255, 0, 0, 0, 0,
    ]);
    const maskBuffer = await sharp(maskRaw, { raw: { width: 2, height: 2, channels: 4 } }).png().toBuffer();

    const result = await renderSlotPhoto({
      photoBuffer,
      cropRect: { x: 0, y: 0, width: 4, height: 4 },
      rotationDeg: 0,
      targetWidthPx: 4,
      targetHeightPx: 4,
      maskBuffer,
    });

    const [, , , leftAlpha] = await pixelAt(result, 0, 0);
    const [, , , rightAlpha] = await pixelAt(result, 3, 0);
    expect(leftAlpha).toBe(255);
    expect(rightAlpha).toBe(0);
  });
});

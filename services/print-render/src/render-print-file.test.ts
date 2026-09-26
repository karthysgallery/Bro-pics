import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { renderPrintFile } from './render-print-file';

async function solidBuffer(width: number, height: number, color: [number, number, number, number]): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) pixels.set(color, i * 4);
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** Fully transparent except for one opaque marker pixel block, so
 * "is this layer drawn on top" is directly testable. */
async function transparentWithMarker(
  width: number,
  height: number,
  markerRect: { x: number; y: number; w: number; h: number },
  color: [number, number, number, number]
): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 4); // all zero = fully transparent
  for (let y = markerRect.y; y < markerRect.y + markerRect.h; y++) {
    for (let x = markerRect.x; x < markerRect.x + markerRect.w; x++) {
      const i = (y * width + x) * 4;
      pixels.set(color, i);
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function pixelAt(buffer: Buffer, x: number, y: number): Promise<[number, number, number, number]> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

const RED: [number, number, number, number] = [255, 0, 0, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];
const GREEN: [number, number, number, number] = [0, 255, 0, 255];

describe('renderPrintFile', () => {
  it('outputs a PNG at exactly the requested print resolution', async () => {
    const photo = await solidBuffer(4, 4, RED);
    const mockup = await transparentWithMarker(20, 20, { x: 0, y: 0, w: 1, h: 1 }, [0, 0, 0, 0] as [number, number, number, number]);
    const result = await renderPrintFile({
      printWidthPx: 20,
      printHeightPx: 20,
      slots: [{ rect: { x: 0, y: 0, width: 1, height: 1 }, photoBuffer: photo, cropRect: { x: 0, y: 0, width: 4, height: 4 }, rotationDeg: 0 }],
      mockupBuffer: mockup,
    });
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(20);
    expect(meta.height).toBe(20);
  });

  it('places a slot photo at its fractional rect position on the print canvas', async () => {
    const photo = await solidBuffer(4, 4, RED);
    const blankMockup = await transparentWithMarker(20, 20, { x: 0, y: 0, w: 0, h: 0 }, [0, 0, 0, 0]);
    const result = await renderPrintFile({
      printWidthPx: 20,
      printHeightPx: 20,
      // Right half of the canvas (x: 0.5-1.0).
      slots: [{ rect: { x: 0.5, y: 0, width: 0.5, height: 1 }, photoBuffer: photo, cropRect: { x: 0, y: 0, width: 4, height: 4 }, rotationDeg: 0 }],
      mockupBuffer: blankMockup,
    });
    expect(await pixelAt(result, 15, 10)).toEqual(RED); // inside the slot (right half)
    // Left half stays background (white) — no slot drawn there.
    expect(await pixelAt(result, 2, 10)).toEqual([255, 255, 255, 255]);
  });

  it('draws the mockup ON TOP of the slot photo (a transparent cutout shows the photo through; opaque mockup pixels cover it)', async () => {
    const photo = await solidBuffer(4, 4, RED);
    // Mockup has an opaque BLUE marker covering the whole canvas except it
    // stays transparent nowhere here — proves mockup wins over the photo
    // wherever the mockup itself is opaque.
    const mockup = await solidBuffer(20, 20, BLUE);
    const result = await renderPrintFile({
      printWidthPx: 20,
      printHeightPx: 20,
      slots: [{ rect: { x: 0, y: 0, width: 1, height: 1 }, photoBuffer: photo, cropRect: { x: 0, y: 0, width: 4, height: 4 }, rotationDeg: 0 }],
      mockupBuffer: mockup,
    });
    expect(await pixelAt(result, 10, 10)).toEqual(BLUE);
  });

  it('draws the overlay on top of the mockup', async () => {
    const photo = await solidBuffer(4, 4, RED);
    const mockup = await solidBuffer(20, 20, BLUE);
    const overlay = await solidBuffer(20, 20, GREEN);
    const result = await renderPrintFile({
      printWidthPx: 20,
      printHeightPx: 20,
      slots: [{ rect: { x: 0, y: 0, width: 1, height: 1 }, photoBuffer: photo, cropRect: { x: 0, y: 0, width: 4, height: 4 }, rotationDeg: 0 }],
      mockupBuffer: mockup,
      overlayBuffer: overlay,
    });
    expect(await pixelAt(result, 10, 10)).toEqual(GREEN);
  });

  it('places clipart at its fractional rect, on top of everything else', async () => {
    const photo = await solidBuffer(4, 4, RED);
    const blankMockup = await transparentWithMarker(20, 20, { x: 0, y: 0, w: 0, h: 0 }, [0, 0, 0, 0]);
    const clipartAsset = await solidBuffer(4, 4, GREEN);
    const result = await renderPrintFile({
      printWidthPx: 20,
      printHeightPx: 20,
      slots: [{ rect: { x: 0, y: 0, width: 1, height: 1 }, photoBuffer: photo, cropRect: { x: 0, y: 0, width: 4, height: 4 }, rotationDeg: 0 }],
      mockupBuffer: blankMockup,
      clipart: { buffer: clipartAsset, rect: { x: 0.7, y: 0.05, width: 0.2, height: 0.2 } },
    });
    // Clipart rect on a 20px canvas: x=14, y=1, w=4, h=4 -> sample inside it.
    expect(await pixelAt(result, 16, 3)).toEqual(GREEN);
  });

  it('composites multiple slots at their own independent positions', async () => {
    const photoA = await solidBuffer(4, 4, RED);
    const photoB = await solidBuffer(4, 4, GREEN);
    const blankMockup = await transparentWithMarker(20, 20, { x: 0, y: 0, w: 0, h: 0 }, [0, 0, 0, 0]);
    const result = await renderPrintFile({
      printWidthPx: 20,
      printHeightPx: 20,
      slots: [
        { rect: { x: 0, y: 0, width: 0.5, height: 1 }, photoBuffer: photoA, cropRect: { x: 0, y: 0, width: 4, height: 4 }, rotationDeg: 0 },
        { rect: { x: 0.5, y: 0, width: 0.5, height: 1 }, photoBuffer: photoB, cropRect: { x: 0, y: 0, width: 4, height: 4 }, rotationDeg: 0 },
      ],
      mockupBuffer: blankMockup,
    });
    expect(await pixelAt(result, 5, 10)).toEqual(RED);
    expect(await pixelAt(result, 15, 10)).toEqual(GREEN);
  });
});

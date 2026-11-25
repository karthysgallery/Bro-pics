import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { addOutline, renderSlotPhoto } from './render-slot';

/** 100x100, transparent, with an opaque red 40x40 square in the middle (a stand-in for a cut-out person). */
async function cutout(): Promise<Buffer> {
  const square = await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 200, g: 20, b: 20, alpha: 1 } } }).png().toBuffer();
  return sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: square, left: 30, top: 30 }])
    .png()
    .toBuffer();
}

async function pixel(png: Buffer, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

describe('outline round a cut-out (a sticker edge)', () => {
  it('lays a solid border of the given width round the shape, under it, keeping the size', async () => {
    const out = await addOutline(await cutout(), '#ffffff', 6);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([100, 100]);
    expect(await pixel(out, 50, 50)).toEqual([200, 20, 20, 255]); // the photo stays on top
    expect(await pixel(out, 26, 50)).toEqual([255, 255, 255, 255]); // 4px outside: border
    expect((await pixel(out, 20, 50))[3]).toBe(0); // 10px outside: clear
    expect((await pixel(out, 5, 5))[3]).toBe(0);
  });

  it('a black & white cut-out keeps its transparency, so the border still follows the person', async () => {
    const src = await cutout();
    const out = await renderSlotPhoto({
      photoBuffer: src,
      cropRect: { x: 0, y: 0, width: 100, height: 100 },
      rotationDeg: 0,
      targetWidthPx: 100,
      targetHeightPx: 100,
      grayscale: true,
      outline: { color: '#ffffff', widthPx: 6 },
    });
    const centre = await pixel(out, 50, 50);
    expect(centre[0]).toBe(centre[1]); // grey
    expect(centre[3]).toBe(255);
    expect(await pixel(out, 26, 50)).toEqual([255, 255, 255, 255]);
    expect((await pixel(out, 10, 10))[3]).toBe(0);
  });
});

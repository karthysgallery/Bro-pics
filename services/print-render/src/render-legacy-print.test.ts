import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { renderLegacyPrintFile } from './render-legacy-print';

async function solidPng(width: number, height: number, color: [number, number, number, number]): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) pixels.set(color, i * 4);
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

const template = { printableRects: [{ slotIndex: 0, x: 0.25, y: 0.1, width: 0.5, height: 0.75 }] };

describe('renderLegacyPrintFile', () => {
  it('leaves out text placed outside the printed area (e.g. on the picture of the frame)', async () => {
    const photo = await solidPng(20, 30, [255, 0, 0, 255]);
    const base = { template, paperPx: { width: 200, height: 300 }, slots: [{ rect: template.printableRects[0]!, photoBuffer: photo, cropRect: { x: 0, y: 0, width: 20, height: 30 }, rotationDeg: 0 as const }] };
    const outside = { zoneRect: { x: 0.05, y: 0.88, width: 0.9, height: 0.06 }, align: 'center' as const, value: 'Karthik', fontKeyOrCssVar: 'dancing-script', color: '#000000' };

    const plain = await renderLegacyPrintFile(base);
    const withOutsideText = await renderLegacyPrintFile({ ...base, textFields: [outside] });
    expect(Buffer.compare(await sharp(plain).raw().toBuffer(), await sharp(withOutsideText).raw().toBuffer())).toBe(0);
  });

  it('centres a differently shaped design on the paper with white margins, never stretched', async () => {
    const photo = await solidPng(10, 10, [255, 0, 0, 255]);
    const square = { printableRects: [{ slotIndex: 0, x: 0.1, y: 0.1, width: 0.8, height: 0.8 }] };
    const out = await renderLegacyPrintFile({ template: square, paperPx: { width: 100, height: 125 }, slots: [{ rect: square.printableRects[0]!, photoBuffer: photo, cropRect: { x: 0, y: 0, width: 10, height: 10 }, rotationDeg: 0 }] });
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect({ w: info.width, h: info.height }).toEqual({ w: 100, h: 125 });
    const px = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3));
    expect(px(50, 5)).toEqual([255, 255, 255]); // top margin
    expect(px(50, 62)).toEqual([255, 0, 0]); // the photo, a 100x100 square in the middle
    expect(px(50, 120)).toEqual([255, 255, 255]); // bottom margin
  });
});

import { describe, it, expect } from 'vitest';
import { cutOutBackground, type Pixels } from './frame-cutout';

const PAPER: [number, number, number] = [250, 246, 240];

/** w x h image: paper outside, a 3px black frame ring, then `inner` colour inside. */
function framed(w: number, h: number, margin: number, inner: [number, number, number, number], opts: { outer?: [number, number, number, number] } = {}): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  const outer = opts.outer ?? [...PAPER, 255];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inFrame = x >= margin && x < w - margin && y >= margin && y < h - margin;
      const inWindow = x >= margin + 3 && x < w - margin - 3 && y >= margin + 3 && y < h - margin - 3;
      const c = inWindow ? inner : inFrame ? [10, 10, 10, 255] : outer;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = c[3];
    }
  }
  return { width: w, height: h, data };
}

const alphaAt = (p: Pixels, x: number, y: number) => p.data[(y * p.width + x) * 4 + 3];

describe('cutOutBackground', () => {
  it('removes the paper outside the frame and crops to its outer edge', () => {
    const r = cutOutBackground(framed(40, 30, 5, [255, 255, 255, 255]))!;
    expect(r).not.toBeNull();
    expect(r.box).toEqual({ x: 5, y: 5, width: 30, height: 20 });
    expect(r.pixels.width).toBe(30);
    expect(r.pixels.height).toBe(20);
  });

  it('keeps an enclosed window opaque even when it is paper-coloured', () => {
    const r = cutOutBackground(framed(40, 30, 5, [...PAPER, 255]))!;
    // centre of the window
    expect(alphaAt(r.pixels, 15, 10)).toBe(255);
    // the black frame ring
    expect(alphaAt(r.pixels, 1, 10)).toBe(255);
  });

  it('keeps the window of a mockup whose window is transparent as part of the frame', () => {
    // Transparent window (alpha 0) enclosed by the ring is not "outside".
    const r = cutOutBackground(framed(40, 30, 5, [0, 0, 0, 0]))!;
    expect(r).not.toBeNull();
    expect(r.box.width).toBe(30);
  });

  it('handles a source whose outside is already transparent', () => {
    const r = cutOutBackground(framed(40, 30, 5, [255, 255, 255, 255], { outer: [0, 0, 0, 0] }))!;
    expect(r.box).toEqual({ x: 5, y: 5, width: 30, height: 20 });
    expect(alphaAt(r.pixels, 15, 10)).toBe(255);
  });

  it('softens the cut edge: partly-background pixels become partly transparent', () => {
    const p = framed(40, 30, 5, [255, 255, 255, 255]);
    // Make the outermost ring pixel a mid-grey blend of paper and black.
    for (let x = 5; x < 35; x++) {
      const i = (5 * 40 + x) * 4;
      p.data[i] = p.data[i + 1] = p.data[i + 2] = 128;
    }
    const r = cutOutBackground(p)!;
    const edge = alphaAt(r.pixels, 10, 0);
    expect(edge).toBeGreaterThan(100);
    expect(edge).toBeLessThan(255);
  });

  it('declines when the corners are not one background colour', () => {
    const p = framed(40, 30, 5, [255, 255, 255, 255]);
    p.data[0] = 0;
    p.data[1] = 0;
    p.data[2] = 0;
    expect(cutOutBackground(p)).toBeNull();
  });

  it('declines when there is nothing to cut (frame fills the image)', () => {
    expect(cutOutBackground(framed(40, 30, 0, [255, 255, 255, 255]))).toBeNull();
  });

  it('declines when the frame would be removed (same colour as the background)', () => {
    const w = 20;
    const h = 20;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    expect(cutOutBackground({ width: w, height: h, data })).toBeNull();
  });

  it('declines tiny or malformed input instead of throwing', () => {
    expect(cutOutBackground({ width: 2, height: 2, data: new Uint8ClampedArray(16) })).toBeNull();
    expect(cutOutBackground({ width: 10, height: 10, data: new Uint8ClampedArray(8) })).toBeNull();
  });

  it('tolerates slight background noise (jpeg-like) within the tolerance', () => {
    const p = framed(40, 30, 5, [255, 255, 255, 255]);
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 40; x++) {
        const outside = x < 5 || x >= 35 || y < 5 || y >= 25;
        if (outside) p.data[(y * 40 + x) * 4] = 250 - ((x + y) % 5);
      }
    }
    const r = cutOutBackground(p)!;
    expect(r.box).toEqual({ x: 5, y: 5, width: 30, height: 20 });
  });
});

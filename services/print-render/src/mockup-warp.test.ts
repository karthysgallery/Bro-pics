import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { squareToQuad, warpToQuad, type Quad } from './mockup-warp';

/** 4 quadrants: TL red, TR green, BR blue, BL yellow — makes orientation errors obvious. */
async function quadrants() {
  const w = 200, h = 200;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    const right = x >= w / 2, bottom = y >= h / 2;
    const c = !right && !bottom ? [255, 0, 0] : right && !bottom ? [0, 255, 0] : right && bottom ? [0, 0, 255] : [255, 255, 0];
    raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2];
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}
async function px(buf: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}
const near = (a: number[], b: number[], tol = 12) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);

describe('squareToQuad', () => {
  it('maps the unit-square corners onto the quad corners (a perspective quad)', () => {
    const q: Quad = [{ x: 100, y: 50 }, { x: 400, y: 80 }, { x: 380, y: 300 }, { x: 120, y: 340 }];
    const m = squareToQuad(q);
    const map = (u: number, v: number) => { const w = m[6] * u + m[7] * v + m[8]; return { x: (m[0] * u + m[1] * v + m[2]) / w, y: (m[3] * u + m[4] * v + m[5]) / w }; };
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => {
      const p = map(u, v);
      expect(p.x).toBeCloseTo(q[i].x, 6);
      expect(p.y).toBeCloseTo(q[i].y, 6);
    });
  });
});

describe('warpToQuad', () => {
  it('places an axis-aligned quad exactly (orientation preserved: TL red, TR green, BR blue, BL yellow)', async () => {
    const quad: Quad = [{ x: 20, y: 30 }, { x: 180, y: 30 }, { x: 180, y: 170 }, { x: 20, y: 170 }];
    const out = await warpToQuad(await quadrants(), quad, 200, 200);
    expect(near(await px(out, 40, 50), [255, 0, 0])).toBe(true);
    expect(near(await px(out, 160, 50), [0, 255, 0])).toBe(true);
    expect(near(await px(out, 160, 150), [0, 0, 255])).toBe(true);
    expect(near(await px(out, 40, 150), [255, 255, 0])).toBe(true);
  });

  it('leaves everything outside the quad fully transparent', async () => {
    const quad: Quad = [{ x: 60, y: 60 }, { x: 140, y: 60 }, { x: 140, y: 140 }, { x: 60, y: 140 }];
    const out = await warpToQuad(await quadrants(), quad, 200, 200);
    expect((await px(out, 10, 10))[3]).toBe(0);
    expect((await px(out, 190, 190))[3]).toBe(0);
    expect((await px(out, 100, 100))[3]).toBe(255);
  });

  it('handles real perspective: a trapezoid keeps the colour order and the far edge is narrower', async () => {
    // Top edge shorter than bottom edge — like a frame receding from the viewer.
    const quad: Quad = [{ x: 70, y: 40 }, { x: 130, y: 40 }, { x: 180, y: 180 }, { x: 20, y: 180 }];
    const out = await warpToQuad(await quadrants(), quad, 200, 200);
    expect(near(await px(out, 85, 60), [255, 0, 0])).toBe(true); // top-left of the artwork
    expect(near(await px(out, 115, 60), [0, 255, 0])).toBe(true); // top-right
    expect(near(await px(out, 140, 170), [0, 0, 255])).toBe(true); // bottom-right
    expect(near(await px(out, 60, 170), [255, 255, 0])).toBe(true); // bottom-left
    // At the top row only the narrow span is covered; the same row's wide corners are empty.
    expect((await px(out, 30, 45))[3]).toBe(0);
    // At the bottom row the artwork is wide.
    expect((await px(out, 40, 175))[3]).toBeGreaterThan(200);
  });

  it('anti-aliases the quad border (partial alpha at a slanted edge, not a hard stair-step)', async () => {
    const quad: Quad = [{ x: 50, y: 40 }, { x: 150, y: 60 }, { x: 150, y: 160 }, { x: 50, y: 140 }]; // slanted top/bottom
    const out = await warpToQuad(await quadrants(), quad, 200, 200);
    const alphas: number[] = [];
    for (let x = 60; x < 140; x++) alphas.push((await px(out, x, Math.round(40 + (x - 50) * 0.2)))[3]);
    expect(alphas.some((a) => a > 0 && a < 255)).toBe(true);
  });

  it('refuses a bow-tie (crossed corners) and non-finite corners too', async () => {
    const bowtie: Quad = [{ x: 20, y: 20 }, { x: 180, y: 180 }, { x: 180, y: 20 }, { x: 20, y: 180 }];
    await expect(warpToQuad(await quadrants(), bowtie, 200, 200)).rejects.toThrow(/convex/);
    const nan: Quad = [{ x: NaN, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    await expect(warpToQuad(await quadrants(), nan, 200, 200)).rejects.toThrow(/non-finite/);
  });

  it('refuses a degenerate quad instead of producing garbage', async () => {
    const flat: Quad = [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 90, y: 10 }, { x: 130, y: 10 }];
    await expect(warpToQuad(await quadrants(), flat, 200, 200)).rejects.toThrow();
  });
});

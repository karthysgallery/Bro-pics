import { describe, it, expect } from 'vitest';
import { applyHomography, quadToMatrix3d, rectToQuadHomography, type Quad } from './homography';

const quad: Quad = [
  { x: 120, y: 80 },
  { x: 520, y: 110 },
  { x: 500, y: 420 },
  { x: 100, y: 380 },
];

describe('rectToQuadHomography', () => {
  it('maps the four corners of the rectangle exactly onto the quad', () => {
    const h = rectToQuadHomography(300, 200, quad);
    const corners = [
      [0, 0],
      [300, 0],
      [300, 200],
      [0, 200],
    ];
    corners.forEach(([x, y], i) => {
      const p = applyHomography(h, x, y);
      expect(p.x).toBeCloseTo(quad[i].x, 6);
      expect(p.y).toBeCloseTo(quad[i].y, 6);
    });
  });

  it('maps the centre inside the quad (perspective, not a plain affine shear)', () => {
    const h = rectToQuadHomography(300, 200, quad);
    const c = applyHomography(h, 150, 100);
    expect(c.x).toBeGreaterThan(100);
    expect(c.x).toBeLessThan(520);
    expect(c.y).toBeGreaterThan(80);
    expect(c.y).toBeLessThan(420);
  });

  it('is the identity-like mapping for an axis-aligned quad', () => {
    const rect: Quad = [
      { x: 10, y: 20 },
      { x: 310, y: 20 },
      { x: 310, y: 220 },
      { x: 10, y: 220 },
    ];
    const h = rectToQuadHomography(300, 200, rect);
    const p = applyHomography(h, 150, 100);
    expect(p.x).toBeCloseTo(160, 6);
    expect(p.y).toBeCloseTo(120, 6);
  });

  it('rejects a degenerate quad instead of producing NaNs', () => {
    const line: Quad = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ];
    expect(() => rectToQuadHomography(100, 100, line)).toThrow(/Degenerate/);
  });
});

describe('quadToMatrix3d', () => {
  it('produces a CSS matrix3d with 16 finite numbers', () => {
    const css = quadToMatrix3d(300, 200, quad);
    expect(css.startsWith('matrix3d(')).toBe(true);
    const nums = css.slice(9, -1).split(',').map(Number);
    expect(nums).toHaveLength(16);
    expect(nums.every(Number.isFinite)).toBe(true);
    // translation column carries the top-left corner
    expect(nums[12]).toBeCloseTo(120, 5);
    expect(nums[13]).toBeCloseTo(80, 5);
  });
});

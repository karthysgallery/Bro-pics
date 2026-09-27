import { describe, it, expect } from 'vitest';
import {
  distanceBetween,
  angleBetweenDeg,
  normalizeAngleDeltaDeg,
  ROTATE_STEP_THRESHOLD_DEG,
  capBitmapDimensions,
  MOBILE_BITMAP_CAP_PX,
} from './EditorCanvas';

// [FE-08] Pure pinch/rotate math, tested directly since jsdom has no 2D
// canvas context and there's no live device/browser in this environment
// to verify the real touch gesture against — see PROJECT_STATUS.md.
describe('distanceBetween', () => {
  it('measures the straight-line distance between two points', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('is zero for the same point', () => {
    expect(distanceBetween({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(0);
  });
});

describe('angleBetweenDeg', () => {
  it('is 0 for two points on the same horizontal line', () => {
    expect(angleBetweenDeg({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
  });

  it('is 90 for a point directly below (canvas y grows downward)', () => {
    expect(angleBetweenDeg({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
  });

  it('is -90 for a point directly above', () => {
    expect(angleBetweenDeg({ x: 0, y: 0 }, { x: 0, y: -10 })).toBe(-90);
  });
});

describe('normalizeAngleDeltaDeg', () => {
  it('leaves a small delta unchanged', () => {
    expect(normalizeAngleDeltaDeg(20)).toBe(20);
    expect(normalizeAngleDeltaDeg(-20)).toBe(-20);
  });

  it('takes the shortest path across the +-180 wrap', () => {
    // 170deg -> -170deg is a 20deg step forward, not a 340deg step back.
    expect(normalizeAngleDeltaDeg(-340)).toBeCloseTo(20, 5);
    expect(normalizeAngleDeltaDeg(340)).toBeCloseTo(-20, 5);
  });

  it('is stable at the exact wrap boundary', () => {
    expect(Math.abs(normalizeAngleDeltaDeg(180))).toBeCloseTo(180, 5);
  });
});

describe('ROTATE_STEP_THRESHOLD_DEG', () => {
  it('is a real threshold below a full 180-degree swing, so a twist steps more than once', () => {
    expect(ROTATE_STEP_THRESHOLD_DEG).toBeGreaterThan(0);
    expect(ROTATE_STEP_THRESHOLD_DEG).toBeLessThan(180);
  });
});

describe('capBitmapDimensions [FE-15]', () => {
  it('returns null (no capping) on a non-mobile viewport regardless of size', () => {
    expect(capBitmapDimensions(6000, 4000, false)).toBeNull();
  });

  it('returns null on mobile when the image is already within the cap', () => {
    expect(capBitmapDimensions(1200, 900, true)).toBeNull();
  });

  it('downscales the longer axis to exactly the cap, preserving aspect ratio', () => {
    const result = capBitmapDimensions(4032, 3024, true); // a typical 12MP iPhone photo
    expect(result).not.toBeNull();
    expect(Math.max(result!.width, result!.height)).toBe(MOBILE_BITMAP_CAP_PX);
    expect(result!.width / result!.height).toBeCloseTo(4032 / 3024, 3);
  });

  it('caps at exactly the boundary value with no capping applied', () => {
    expect(capBitmapDimensions(MOBILE_BITMAP_CAP_PX, MOBILE_BITMAP_CAP_PX, true)).toBeNull();
  });

  it('caps a portrait image on its height, the longer axis', () => {
    const result = capBitmapDimensions(3000, 6000, true);
    expect(result).toEqual({ width: 1024, height: MOBILE_BITMAP_CAP_PX });
  });
});

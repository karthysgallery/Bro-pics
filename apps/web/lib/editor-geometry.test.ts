import { describe, it, expect } from 'vitest';
import { fractionRectToCanvasRect } from './editor-geometry';

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

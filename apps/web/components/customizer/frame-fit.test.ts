import { describe, it, expect } from 'vitest';
import { frameFit } from './frame-moulding';

describe('frameFit', () => {
  it('without a frame it is just the design fitted to the box (width- or height-limited)', () => {
    expect(frameFit({ width: 500, height: 500 }, 2 / 3, 0).designWidth).toBeCloseTo(333.3, 0); // tall design: height-limited
    expect(frameFit({ width: 300, height: 900 }, 2 / 3, 0).designWidth).toBe(300); // narrow box: width-limited
  });
  it('leaves room for the frame on every side, so design plus frame fit the box', () => {
    const k = 0.06;
    const fit = frameFit({ width: 500, height: 500 }, 2 / 3, k);
    const totalW = fit.designWidth + 2 * fit.moulding;
    const totalH = fit.designWidth / (2 / 3) + 2 * fit.moulding;
    expect(totalW).toBeLessThanOrEqual(500.001);
    expect(totalH).toBeLessThanOrEqual(500.001);
    expect(Math.max(totalW, totalH)).toBeCloseTo(500, 0); // and it uses the room
    expect(fit.moulding).toBeCloseTo(fit.designWidth * k, 5);
  });
  it('never returns a zero size', () => {
    expect(frameFit({ width: 0, height: 0 }, 1, 0.1).designWidth).toBeGreaterThanOrEqual(1);
  });
});

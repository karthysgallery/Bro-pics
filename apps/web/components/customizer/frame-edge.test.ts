import { describe, it, expect } from 'vitest';
import { detectMouldingWidth, type Pixels } from './frame-edge';

/** A synthetic frame photo: textured moulding `border` px wide, then `lip` px of white, then the opening. */
function framePhoto(opts: { w: number; h: number; border: number; lip?: number; opening: 'white' | 'transparent' | 'grey'; mouldingLight?: number }): Pixels {
  const { w, h, border, lip = 0 } = opts;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const depth = Math.min(x, y, w - 1 - x, h - 1 - y);
      let rgba: [number, number, number, number];
      if (depth < border) {
        const grain = ((x * 7 + y * 13) % 9) * 6; // texture
        rgba = opts.mouldingLight
          ? [opts.mouldingLight + grain / 3, opts.mouldingLight + grain / 3, opts.mouldingLight + grain / 3, 255] // a white-painted frame
          : [60 + grain, 42 + grain, 24 + grain, 255]; // brown wood
      } else if (depth < border + lip) rgba = [250, 250, 250, 255];
      else if (opts.opening === 'transparent') rgba = [0, 0, 0, 0];
      else if (opts.opening === 'grey') rgba = [200, 196, 190, 255];
      else rgba = [252, 252, 252, 255];
      data.set(rgba, i);
    }
  }
  return { data, width: w, height: h };
}

describe('detectMouldingWidth', () => {
  it('stops at the white inner edge, so none of it is drawn around the picture', () => {
    expect(detectMouldingWidth(framePhoto({ w: 400, h: 500, border: 40, lip: 8, opening: 'grey' }))).toBe(40);
  });
  it('finds the opening of an empty frame (transparent, white or a plain wall)', () => {
    expect(detectMouldingWidth(framePhoto({ w: 400, h: 400, border: 30, opening: 'transparent' }))).toBe(30);
    expect(detectMouldingWidth(framePhoto({ w: 400, h: 400, border: 30, opening: 'white' }))).toBe(30);
    expect(detectMouldingWidth(framePhoto({ w: 400, h: 400, border: 30, opening: 'grey' }))).toBe(30);
  });
  it('gives up (keeps the owner’s marking) for a white frame around a white mount', () => {
    expect(detectMouldingWidth(framePhoto({ w: 400, h: 400, border: 30, opening: 'white', mouldingLight: 240 }))).toBeNull();
  });
});

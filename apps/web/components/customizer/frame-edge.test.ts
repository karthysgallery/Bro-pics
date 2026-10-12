import { describe, it, expect } from 'vitest';
import { detectMouldingWidth, detectOuterMargins, measureFrame, type Pixels } from './frame-edge';

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

/** A frame photo with a light background strip left along some sides (scanned or cropped carelessly). */
function withMargin(inner: Pixels, m: { top?: number; bottom?: number; left?: number; right?: number }, shade = 248): Pixels {
  const t = m.top ?? 0, b = m.bottom ?? 0, l = m.left ?? 0, r = m.right ?? 0;
  const width = inner.width + l + r;
  const height = inner.height + t + b;
  const data = new Uint8ClampedArray(width * height * 4).fill(shade);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  for (let y = 0; y < inner.height; y++) data.set(inner.data.subarray(y * inner.width * 4, (y + 1) * inner.width * 4), ((y + t) * width + l) * 4);
  return { data, width, height };
}

describe('detectOuterMargins', () => {
  const frame = framePhoto({ w: 400, h: 500, border: 40, opening: 'grey' });
  it('finds a light strip along the right and bottom only', () => {
    const m = detectOuterMargins(withMargin(frame, { right: 14, bottom: 18 }));
    expect(m.top).toBe(0);
    expect(m.left).toBe(0);
    expect(m.right).toBeGreaterThanOrEqual(14);
    expect(m.right).toBeLessThanOrEqual(16);
    expect(m.bottom).toBeGreaterThanOrEqual(18);
    expect(m.bottom).toBeLessThanOrEqual(20);
  });
  it('finds nothing in a clean frame photo', () => {
    expect(detectOuterMargins(frame)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
  it('treats see-through edges as margin too', () => {
    const data = new Uint8ClampedArray(frame.data);
    // make the last 10 columns transparent
    for (let y = 0; y < frame.height; y++) for (let x = frame.width - 10; x < frame.width; x++) data[(y * frame.width + x) * 4 + 3] = 0;
    expect(detectOuterMargins({ ...frame, data }).right).toBeGreaterThanOrEqual(10);
  });
  it('leaves a white-painted frame alone', () => {
    expect(detectOuterMargins(framePhoto({ w: 400, h: 400, border: 30, opening: 'white', mouldingLight: 240 }))).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
  it('still measures the moulding after the strips are cut off', () => {
    const r = measureFrame(withMargin(frame, { right: 14, bottom: 18 }));
    expect(r.mould).toBe(40);
  });
});

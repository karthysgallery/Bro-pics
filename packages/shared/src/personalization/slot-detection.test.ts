import { describe, it, expect } from 'vitest';
import { detectPhotoSlots, templateDraftFromDetection, type RgbaPixels } from './slot-detection';
import { validateTemplate } from './validate-template';

type RGBA = [number, number, number, number];

function canvas(w: number, h: number, fill: RGBA): RgbaPixels & { set: (x: number, y: number, c: RGBA) => void } {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(fill, i * 4);
  return {
    width: w,
    height: h,
    data,
    set(x, y, c) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      data.set(c, (y * w + x) * 4);
    },
  };
}

type Img = ReturnType<typeof canvas>;

function rect(img: Img, x: number, y: number, w: number, h: number, c: RGBA) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) img.set(xx, yy, c);
}

function outline(img: Img, x: number, y: number, w: number, h: number, t: number, c: RGBA) {
  rect(img, x, y, w, t, c);
  rect(img, x, y + h - t, w, t, c);
  rect(img, x, y, t, h, c);
  rect(img, x + w - t, y, t, h, c);
}

function ellipse(img: Img, cx: number, cy: number, rx: number, ry: number, c: RGBA) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) img.set(x, y, c);
}

function rotatedRect(img: Img, cx: number, cy: number, w: number, h: number, deg: number, c: RGBA) {
  const rad = (deg * Math.PI) / 180;
  const r = Math.hypot(w, h) / 2 + 2;
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const u = dx * Math.cos(-rad) - dy * Math.sin(-rad);
      const v = dx * Math.sin(-rad) + dy * Math.cos(-rad);
      if (Math.abs(u) <= w / 2 && Math.abs(v) <= h / 2) img.set(x, y, c);
    }
}

function roundedRect(img: Img, x: number, y: number, w: number, h: number, r: number, c: RGBA) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) {
      const px = xx + 0.5;
      const py = yy + 0.5;
      const cx = Math.min(Math.max(px, x + r), x + w - r);
      const cy = Math.min(Math.max(py, y + r), y + h - r);
      if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) img.set(xx, yy, c);
    }
}

/** Deterministic "photo" texture: busy colours, never the white gutter colour. */
function photo(img: Img, x: number, y: number, w: number, h: number, seed: number) {
  let s = seed;
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      img.set(xx, yy, [40 + (s % 150), 30 + ((s >> 8) % 120), 20 + ((s >> 16) % 160), 255]);
    }
}

const WHITE: RGBA = [255, 255, 255, 255];
const WOOD: RGBA = [120, 80, 50, 255];
const GREY: RGBA = [220, 220, 222, 255];
const CLEAR: RGBA = [0, 0, 0, 0];

describe('detectPhotoSlots — transparent windows', () => {
  it('finds each enclosed window, shapes included, in reading order, and lays the design above the photos', () => {
    const img = canvas(400, 300, WOOD);
    rect(img, 20, 20, 100, 120, CLEAR);
    rect(img, 150, 20, 100, 120, CLEAR);
    ellipse(img, 320, 80, 50, 60, CLEAR);
    rect(img, 20, 170, 360, 100, CLEAR);
    const r = detectPhotoSlots(img);
    expect(r.mode).toBe('transparent-windows');
    expect(r.artworkPlacement).toBe('above-photos');
    expect(r.slots.map((s) => s.shape)).toEqual(['rect', 'rect', 'ellipse', 'rect']);
    // First window, grown 2px so the photo tucks under the frame's edge.
    const first = r.slots[0];
    expect(first.x).toBeCloseTo(18 / 400, 3);
    expect(first.y).toBeCloseTo(18 / 300, 3);
    expect(first.width).toBeCloseTo(104 / 400, 3);
    expect(first.height).toBeCloseTo(124 / 300, 3);
    expect(first.rotationDeg).toBe(0);
    expect(r.slots.every((s) => s.source === 'transparent-window')).toBe(true);
  });

  it('measures a tilted window', () => {
    const img = canvas(400, 400, WOOD);
    rotatedRect(img, 200, 200, 180, 120, 12, CLEAR);
    const r = detectPhotoSlots(img);
    expect(r.slots).toHaveLength(1);
    expect(r.slots[0].shape).toBe('rect');
    expect(r.slots[0].rotationDeg).toBeGreaterThan(10);
    expect(r.slots[0].rotationDeg).toBeLessThan(14);
    expect(r.slots[0].width * 400).toBeCloseTo(184, -1);
  });

  it('ignores a transparent surround that touches the edge (a frame on a cut-out background)', () => {
    const img = canvas(300, 300, CLEAR);
    rect(img, 30, 30, 240, 240, WOOD);
    rect(img, 70, 70, 160, 160, CLEAR);
    const r = detectPhotoSlots(img);
    expect(r.slots).toHaveLength(1);
    expect(r.slots[0].x).toBeCloseTo(68 / 300, 3);
  });
});

describe('detectPhotoSlots — opaque designs', () => {
  it('finds grey placeholder boxes on a white page and ignores a title line', () => {
    const img = canvas(600, 400, WHITE);
    for (let i = 0; i < 6; i++) rect(img, 30 + (i % 3) * 190, 30 + Math.floor(i / 3) * 170, 160, 140, GREY);
    rect(img, 150, 375, 300, 4, [40, 40, 40, 255]); // a thin title rule
    const r = detectPhotoSlots(img);
    expect(r.mode).toBe('opaque');
    expect(r.artworkPlacement).toBe('below-photos');
    expect(r.backgroundColor).toBe('#ffffff');
    expect(r.slots).toHaveLength(6);
    expect(r.slots.every((s) => s.shape === 'rect')).toBe(true);
    // Reading order: top row left to right, then bottom row. Each slot overlaps
    // its placeholder by one pixel so no grey edge shows around the photo.
    expect(r.slots.map((s) => Math.round(s.x * 600))).toEqual([29, 219, 409, 29, 219, 409]);
    expect(r.slots.map((s) => Math.round(s.y * 400))).toEqual([29, 29, 29, 199, 199, 199]);
    expect(Math.round(r.slots[0].width * 600)).toBe(162);
  });

  it('uses the inside of outlined boxes, so the printed outline stays visible', () => {
    const img = canvas(400, 300, WHITE);
    outline(img, 40, 40, 140, 200, 4, [20, 20, 20, 255]);
    outline(img, 220, 40, 140, 200, 4, [20, 20, 20, 255]);
    const r = detectPhotoSlots(img);
    expect(r.slots).toHaveLength(2);
    // The 4px outline stays visible; the photo tucks one pixel under its inner edge.
    expect(Math.round(r.slots[0].x * 400)).toBe(43);
    expect(Math.round(r.slots[0].width * 400)).toBe(134);
    expect(r.slots[0].source).toBe('enclosed-area');
  });

  it('recognises rounded placeholders and estimates their corner radius', () => {
    const img = canvas(400, 300, WHITE);
    roundedRect(img, 50, 50, 200, 200, 40, GREY);
    const r = detectPhotoSlots(img);
    expect(r.slots).toHaveLength(1);
    expect(r.slots[0].shape).toBe('rounded');
    expect(r.slots[0].cornerRadius!).toBeGreaterThan(0.12);
    expect(r.slots[0].cornerRadius!).toBeLessThan(0.28);
  });

  it('finds the photos of a sample collage separated by white gutters, but not the outer border', () => {
    const img = canvas(500, 400, WHITE);
    outline(img, 10, 10, 480, 380, 6, [30, 30, 30, 255]);
    photo(img, 40, 40, 200, 150, 1);
    photo(img, 260, 40, 200, 150, 2);
    photo(img, 40, 210, 420, 150, 3);
    const r = detectPhotoSlots(img);
    expect(r.slots.map((s) => [Math.round(s.x * 500), Math.round(s.y * 400)])).toEqual([
      [39, 39],
      [259, 39],
      [39, 209],
    ]);
  });

  it('reports clearly when there is no plain background to work from', () => {
    const img = canvas(200, 200, WHITE);
    photo(img, 0, 0, 200, 200, 7);
    const r = detectPhotoSlots(img);
    expect(r.mode).toBe('none');
    expect(r.slots).toHaveLength(0);
    expect(r.notes.join(' ')).toMatch(/draw the slots by hand/i);
  });

  it('refuses images too small to analyse instead of throwing', () => {
    expect(detectPhotoSlots({ width: 4, height: 4, data: new Uint8ClampedArray(64) }).mode).toBe('none');
  });
});

describe('templateDraftFromDetection', () => {
  it('builds a valid draft with the design above transparent windows', () => {
    const img = canvas(400, 300, WOOD);
    rect(img, 20, 20, 160, 260, CLEAR);
    rect(img, 220, 20, 160, 260, CLEAR);
    const detection = detectPhotoSlots(img);
    const draft = templateDraftFromDetection({
      id: 'twin-frame',
      name: 'Twin frame',
      artwork: { assetId: 'media_1', url: 'https://example.test/twin.png' },
      canvas: { width: 3600, height: 2700 },
      detection,
    });
    expect(draft.status).toBe('draft');
    expect(draft.type).toBe('multi_photo');
    expect(draft.photoSlots.map((s) => s.id)).toEqual(['photo_01', 'photo_02']);
    expect(draft.layers.map((l) => l.kind)).toEqual(['photoSlot', 'photoSlot', 'fixed']);
    expect(validateTemplate(draft).valid).toBe(true);
  });

  it('puts the design underneath when the photos cover placeholders', () => {
    const img = canvas(400, 300, WHITE);
    rect(img, 40, 40, 140, 200, GREY);
    const draft = templateDraftFromDetection({
      id: 'single',
      name: 'Single',
      artwork: { assetId: 'media_2' },
      canvas: { width: 2400, height: 1800 },
      detection: detectPhotoSlots(img),
    });
    expect(draft.layers.map((l) => l.kind)).toEqual(['fixed', 'photoSlot']);
    expect(draft.background).toEqual({ type: 'color', color: '#ffffff' });
    expect(draft.photoSlots[0].label).toBe('Your photo');
  });

  it('fills a dominant hero space first and calls it the main photo', () => {
    const img = canvas(600, 400, WHITE);
    rect(img, 20, 40, 120, 100, GREY);
    rect(img, 200, 40, 200, 320, GREY);
    rect(img, 460, 40, 120, 100, GREY);
    const draft = templateDraftFromDetection({ id: 'hero', name: 'Hero', artwork: { assetId: 'a' }, canvas: { width: 3000, height: 2000 }, detection: detectPhotoSlots(img) });
    expect(draft.photoSlots[0].label).toBe('Main photo');
    expect(Math.round(draft.photoSlots[0].x * 600)).toBe(199);
    expect(draft.photoSlots.map((s) => s.label)).toEqual(['Main photo', 'Photo 2', 'Photo 3']);
  });
});

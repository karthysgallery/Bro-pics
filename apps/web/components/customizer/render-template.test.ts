import { describe, it, expect } from 'vitest';
import { CalendarSlotSchema, cropRectInOriginalPx, type PersonalizationState, type PersonalizationTemplate, type SlotPhoto } from '@bro-pics/shared';
import { photoToSlotMatrix, renderTemplate, renderToDataUrl, requiredImageSources, type Matrix2D } from './render-template';

function apply(m: Matrix2D, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

describe('photoToSlotMatrix', () => {
  const aspect = 0.8;
  const slotW = 500;
  const slotH = slotW / aspect;

  for (const rotation of [0, 90, 180, 270] as const) {
    it(`maps the printed crop exactly onto the slot at ${rotation}°`, () => {
      const photo = { width: 4000, height: 3000, rotation, transform: { scale: 1.6, offsetX: 0.12, offsetY: -0.08 } };
      const crop = cropRectInOriginalPx(photo.width, photo.height, rotation, aspect, photo.transform);
      const m = photoToSlotMatrix(photo, aspect, slotW);
      const corners = [
        [crop.x, crop.y],
        [crop.x + crop.width, crop.y],
        [crop.x, crop.y + crop.height],
        [crop.x + crop.width, crop.y + crop.height],
      ].map(([x, y]) => apply(m, x, y).map((v) => Math.round(v * 1000) / 1000));
      const sorted = corners.map((p) => p.join(',')).sort();
      expect(sorted).toEqual(['0,0', `0,${slotH}`, `${slotW},0`, `${slotW},${slotH}`].sort());
    });
  }

  it('turns the photo clockwise for 90°', () => {
    // The original top-left corner ends up at the top-right of the rotated photo.
    const photo = { width: 300, height: 200, rotation: 90 as const, transform: { scale: 1, offsetX: 0, offsetY: 0 } };
    const m = photoToSlotMatrix(photo, 200 / 300, 200);
    const [x, y] = apply(m, 0, 0);
    expect(x).toBeCloseTo(200);
    expect(y).toBeCloseTo(0);
  });
});

// --- A canvas stand-in that records what was drawn -------------------------

interface Call {
  op: string;
  args: unknown[];
}

function fakeCanvas(width: number, height: number, log: Call[], label: string) {
  const ctx = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'measureText') return (text: string) => ({ width: text.length * 5 });
        return (...args: unknown[]) => {
          log.push({ op: prop, args: args.map((a) => (a && typeof a === 'object' && 'label' in (a as object) ? (a as { label: string }).label : a)) });
        };
      },
      set() {
        return true;
      },
    }
  );
  return {
    label,
    width,
    height,
    getContext: () => ctx,
    toDataURL: () => 'data:image/jpeg;base64,AAAA',
  } as unknown as HTMLCanvasElement;
}

const template: PersonalizationTemplate = {
  id: 'two-up',
  version: 1,
  status: 'published',
  type: 'collage',
  name: 'Two up',
  canvas: { width: 1200, height: 800, dpi: 100, safeInset: 0, bleedMm: 0 },
  photoSlots: [
    { id: 'a', label: 'Left', required: true, x: 0.05, y: 0.1, width: 0.4, height: 0.8, rotationDeg: 0, shape: 'rect', fit: 'cover' },
    { id: 'b', label: 'Right', required: true, x: 0.55, y: 0.1, width: 0.4, height: 0.8, rotationDeg: 0, shape: 'ellipse', fit: 'cover' },
  ],
  textSlots: [],
  layers: [
    { kind: 'photoSlot', slotId: 'a' },
    { kind: 'photoSlot', slotId: 'b' },
    { kind: 'fixed', id: 'design', role: 'frame', asset: { assetId: 'm1', url: '/art.png' }, x: 0, y: 0, width: 1, height: 1, printed: true },
  ],
  tags: [],
};

const photo = (assetId: string): SlotPhoto => ({ assetId, width: 1000, height: 1500, transform: { scale: 1, offsetX: 0, offsetY: 0 }, rotation: 0, confirmedLowDpi: false });

const state: PersonalizationState = {
  schemaVersion: 1,
  templateId: 'two-up',
  templateVersion: 1,
  slots: { a: photo('up_a'), b: photo('up_b') },
  texts: {},
};

function images(loaded: string[]) {
  const map = new Map(loaded.map((src) => [src, { label: src } as unknown as CanvasImageSource]));
  return (src: string) => map.get(src);
}

const base = {
  template,
  state,
  assetSrc: (ref: { url?: string }) => ref.url ?? null,
  photoSrc: (_slot: string, p: SlotPhoto) => `blob:${p.assetId}`,
  fontFamily: () => 'serif',
  includeUnprinted: false,
};

describe('renderTemplate', () => {
  it('paints photos first and the collage artwork over them', () => {
    const log: Call[] = [];
    const main = fakeCanvas(600, 400, log, 'main');
    const result = renderTemplate(main.getContext('2d')!, {
      ...base,
      width: 600,
      height: 400,
      mode: 'export',
      getImage: images(['/art.png', 'blob:up_a', 'blob:up_b']),
      createCanvas: (w, h) => fakeCanvas(w, h, [], 'slot'),
    });
    expect(result.missing).toEqual([]);
    const drawn = log.filter((c) => c.op === 'drawImage').map((c) => c.args[0]);
    expect(drawn).toEqual(['slot', 'slot', '/art.png']);
  });

  it('reports photos that are not loaded instead of silently leaving them out', () => {
    const result = renderTemplate(fakeCanvas(600, 400, [], 'main').getContext('2d')!, {
      ...base,
      width: 600,
      height: 400,
      mode: 'export',
      getImage: images(['/art.png', 'blob:up_a']),
      createCanvas: (w, h) => fakeCanvas(w, h, [], 'slot'),
    });
    expect(result.missing).toEqual(['blob:up_b']);
  });

  it('refuses to export an incomplete picture', () => {
    const create = (w: number, h: number) => fakeCanvas(w, h, [], 'c');
    expect(renderToDataUrl({ ...base, getImage: images(['/art.png', 'blob:up_a']), createCanvas: create }, 800)).toBeNull();
    expect(renderToDataUrl({ ...base, getImage: images(['/art.png', 'blob:up_a', 'blob:up_b']), createCanvas: create }, 800)).toMatch(/^data:image\/jpeg/);
  });

  it('draws a calendar on top, its chosen day marked, and leaves it out of an export before a date is picked', () => {
    const calendarTemplate: PersonalizationTemplate = {
      ...template,
      calendarSlots: [CalendarSlotSchema.parse({ id: 'cal', label: 'Date', x: 0.1, y: 0.5, width: 0.8, height: 0.45 })],
      layers: [...template.layers, { kind: 'calendar', slotId: 'cal' }],
    };
    const run = (dates: Record<string, { date: string }> | undefined, mode: 'export' | 'editor') => {
      const log: Call[] = [];
      renderTemplate(fakeCanvas(600, 400, log, 'main').getContext('2d')!, {
        ...base,
        template: calendarTemplate,
        state: { ...state, dates },
        width: 600,
        height: 400,
        mode,
        getImage: images(['/art.png', 'blob:up_a', 'blob:up_b']),
        createCanvas: (w, h) => fakeCanvas(w, h, [], 'slot'),
      });
      return log;
    };
    const picked = run({ cal: { date: '2024-05-24' } }, 'export');
    const texts = picked.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    expect(texts.slice(0, 3)).toEqual(['May 2024', 'SUN', 'MON']);
    expect(texts).toContain('24');
    // The heart is drawn (bezier curves + fill) after the artwork.
    expect(picked.filter((c) => c.op === 'bezierCurveTo')).toHaveLength(6);
    expect(picked.findIndex((c) => c.op === 'bezierCurveTo')).toBeGreaterThan(picked.findIndex((c) => c.op === 'drawImage' && c.args[0] === '/art.png'));
    expect(run(undefined, 'export').some((c) => c.op === 'fillText')).toBe(false);
    // In the editor the month shows without a marked day until a date is picked.
    const editor = run(undefined, 'editor');
    expect(editor.some((c) => c.op === 'fillText')).toBe(true);
    expect(editor.some((c) => c.op === 'bezierCurveTo')).toBe(false);
  });

  it('lists every image the design needs', () => {
    const { srcs, unresolvedPhotos } = requiredImageSources({
      ...base,
      photoSrc: (slot, p) => (slot === 'a' ? `blob:${p.assetId}` : null),
    });
    expect(srcs.sort()).toEqual(['/art.png', 'blob:up_a']);
    expect(unresolvedPhotos).toEqual(['b']);
  });
});

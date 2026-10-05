import { describe, it, expect } from 'vitest';
import { hitTestPhotoSlot, panTransform, pointInPolygon, slotContainsPoint, zoomTo, zoomTransform } from './interaction';
import { PersonalizationTemplateSchema } from './template-schema';
import type { SlotPhoto } from './state';

const canvas = { width: 1000, height: 1000 };

function template(slots: Array<Record<string, unknown>>) {
  return PersonalizationTemplateSchema.parse({
    id: 't',
    version: 1,
    type: 'collage',
    name: 't',
    canvas: { ...canvas, dpi: 300 },
    photoSlots: slots.map((s, i) => ({ id: `p${i + 1}`, label: `P${i + 1}`, ...s })),
    layers: slots.map((_, i) => ({ kind: 'photoSlot', slotId: `p${i + 1}` })),
  });
}

const photo = (over: Partial<SlotPhoto> = {}): SlotPhoto => ({
  assetId: 'a',
  width: 2000,
  height: 1000,
  transform: { scale: 1, offsetX: 0, offsetY: 0 },
  rotation: 0,
  confirmedLowDpi: false,
  ...over,
});

describe('hit testing', () => {
  it('finds the slot under the point and nothing outside', () => {
    const t = template([{ x: 0.1, y: 0.1, width: 0.3, height: 0.3 }, { x: 0.6, y: 0.6, width: 0.3, height: 0.3 }]);
    expect(hitTestPhotoSlot(t, 1000, 1000, 200, 200)).toBe('p1');
    expect(hitTestPhotoSlot(t, 1000, 1000, 700, 700)).toBe('p2');
    expect(hitTestPhotoSlot(t, 1000, 1000, 500, 500)).toBeNull();
  });

  it('prefers the slot painted last where slots overlap', () => {
    const t = template([{ x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, { x: 0.3, y: 0.3, width: 0.5, height: 0.5 }]);
    expect(hitTestPhotoSlot(t, 1000, 1000, 400, 400)).toBe('p2');
  });

  it('respects slot rotation', () => {
    // A thin bar rotated 90° stands upright around its centre (500,500).
    const t = template([{ x: 0.3, y: 0.45, width: 0.4, height: 0.1, rotationDeg: 90 }]);
    expect(hitTestPhotoSlot(t, 1000, 1000, 500, 350)).toBe('p1');
    expect(hitTestPhotoSlot(t, 1000, 1000, 350, 500)).toBeNull();
  });

  it('respects ellipse and rounded shapes at the corners', () => {
    const ellipse = { x: 0.1, y: 0.1, width: 0.4, height: 0.4, shape: 'ellipse' };
    expect(slotContainsPoint(ellipse as never, 1000, 1000, 105, 105)).toBe(false);
    expect(slotContainsPoint(ellipse as never, 1000, 1000, 300, 300)).toBe(true);
    const rounded = { x: 0.1, y: 0.1, width: 0.4, height: 0.4, shape: 'rounded', cornerRadius: 0.25 };
    expect(slotContainsPoint(rounded as never, 1000, 1000, 101, 101)).toBe(false);
    expect(slotContainsPoint(rounded as never, 1000, 1000, 300, 101)).toBe(true);
  });

  it('respects polygons', () => {
    const triangle = [{ x: 0, y: 1 }, { x: 0.5, y: 0 }, { x: 1, y: 1 }];
    expect(pointInPolygon(0.5, 0.8, triangle)).toBe(true);
    expect(pointInPolygon(0.05, 0.1, triangle)).toBe(false);
  });
});

describe('pan and zoom', () => {
  const slot = { x: 0.1, y: 0.1, width: 0.4, height: 0.4, rotationDeg: 0 };

  it('pans with the drag, in fractions of the slot', () => {
    // 2:1 photo in a square slot: room to pan horizontally only.
    const t = panTransform(slot, canvas, photo(), 40, 30, 1000, 1000);
    expect(t.offsetX).toBeCloseTo(0.1, 6);
    expect(t.offsetY).toBe(0);
  });

  it('never pans the photo off its slot', () => {
    const t = panTransform(slot, canvas, photo(), 10_000, 0, 1000, 1000);
    expect(t.offsetX).toBeCloseTo(0.5, 6);
  });

  it('turns a drag on a tilted slot into the slot\'s own direction', () => {
    const tilted = { ...slot, rotationDeg: 90 };
    const zoomed = photo({ transform: { scale: 2, offsetX: 0, offsetY: 0 } });
    // Dragging down on a slot turned 90° clockwise moves along its own x axis.
    const t = panTransform(tilted, canvas, zoomed, 0, 40, 1000, 1000);
    expect(t.offsetX).toBeCloseTo(0.1, 6);
    expect(t.offsetY).toBeCloseTo(0, 6);
  });

  it('zooms about the centre without moving a centred photo', () => {
    const t = zoomTransform(slot, canvas, photo(), 2);
    expect(t).toEqual({ scale: 2, offsetX: 0, offsetY: 0 });
  });

  it('keeps the point under the focus in place while zooming', () => {
    const t = zoomTransform(slot, canvas, photo({ width: 1000, height: 1000 }), 2, { u: 0.75, v: 0.5 });
    // Focus 0.25 right of centre: the photo centre moves left so that point stays put.
    expect(t.offsetX).toBeCloseTo(-0.25, 6);
  });

  it('cannot zoom out past cover or beyond the maximum', () => {
    expect(zoomTransform(slot, canvas, photo(), 0.1).scale).toBe(1);
    expect(zoomTo(slot, canvas, photo(), 50).scale).toBe(8);
  });
});

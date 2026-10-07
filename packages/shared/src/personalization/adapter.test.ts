import { describe, it, expect } from 'vitest';
import { fromFrameTemplate, stateFromCustomizations } from './adapter';
import { validateTemplate } from './validate-template';
import { checkCompleteness } from './completeness';
import { cropRectInOriginalPx, slotAspectRatio } from './geometry';
import type { FrameTemplate } from '../schemas/frame-template';

const legacy: FrameTemplate = {
  id: 'tpl_classic_v3',
  variantId: 'var_classic_8x12',
  mockupUrl: 'https://cdn.example/mockup.png',
  maskUrl: null,
  overlayUrl: 'https://cdn.example/glare.png',
  printableRects: [
    { slotIndex: 1, x: 0.5, y: 0.1, width: 0.4, height: 0.8 },
    { slotIndex: 0, x: 0.1, y: 0.1, width: 0.4, height: 0.8 },
  ],
  bleedMm: 3,
  matInset: 0,
  version: 3,
  isCurrent: true,
  textZones: [{ fieldKey: 'caption', label: 'Caption', x: 0.1, y: 0.9, width: 0.8, height: 0.08, maxLength: 30, align: 'center', required: true }],
  clipartOptions: [],
};
const opts = { templateId: 'classic-wooden-frame-8x12', name: 'Classic wooden frame', canvasWidthPx: 2400, canvasHeightPx: 3600 };

describe('legacy FrameTemplate -> v2 template', () => {
  const t = fromFrameTemplate(legacy, opts);

  it('produces a valid template that keeps the legacy version number (so pinned customizations still resolve)', () => {
    expect(validateTemplate(t).valid).toBe(true);
    expect(t.version).toBe(3);
    expect(t.id).toBe('classic-wooden-frame-8x12');
  });

  it('keeps slot geometry exactly and orders slots by slotIndex', () => {
    expect(t.photoSlots.map((s) => [s.id, s.x, s.width])).toEqual([['photo_01', 0.1, 0.4], ['photo_02', 0.5, 0.4]]);
  });

  it('preserves the legacy paint order (photos -> frame -> overlay -> text) and keeps the frame and glare OUT of the print', () => {
    expect(t.layers.map((l) => (l.kind === 'fixed' ? l.id : `${l.kind}:${l.slotId}`))).toEqual([
      'photoSlot:photo_01', 'photoSlot:photo_02', 'legacy-frame', 'legacy-overlay', 'text:caption',
    ]);
    const fixed = t.layers.filter((l) => l.kind === 'fixed');
    expect(fixed.every((l) => l.kind === 'fixed' && !l.printed)).toBe(true);
  });

  it('prints the template’s printed artwork, between the photos and the frame', () => {
    const withArt = fromFrameTemplate({ ...legacy, printArtworkUrl: '/art/border.png' }, opts);
    const art = withArt.layers.find((l) => l.kind === 'fixed' && l.id === 'legacy-print-artwork');
    expect(art).toMatchObject({ printed: true, role: 'decoration' });
    expect(withArt.layers.map((l) => (l.kind === 'fixed' ? l.id : l.kind)).indexOf('legacy-print-artwork')).toBe(2);
  });

  it('carries text zones over as text slots', () => {
    expect(t.textSlots[0]).toMatchObject({ id: 'caption', required: true, maxLength: 30 });
  });
});

describe('legacy Customization docs -> v2 state', () => {
  const t = fromFrameTemplate(legacy, opts);
  const aspect = slotAspectRatio(t.photoSlots[0], t.canvas);

  it('restores the SAME crop the customer saw (the legacy cropRect survives the round trip)', () => {
    // A customer's saved crop of a 4032x3024 photo, rotation 0.
    const cropRect = { x: 600, y: 20, width: 3000 * aspect, height: 3000 }; // fully inside the 4032x3024 photo
    const state = stateFromCustomizations(t, [
      { slotIndex: 0, uploadId: 'up_1', photoWidth: 4032, photoHeight: 3024, transformJson: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, cropRect } },
    ]);
    const photo = state.slots.photo_01;
    const regained = cropRectInOriginalPx(photo.width, photo.height, photo.rotation, aspect, photo.transform);
    expect(regained.x).toBeCloseTo(cropRect.x, 3);
    expect(regained.y).toBeCloseTo(cropRect.y, 3);
    expect(regained.width).toBeCloseTo(cropRect.width, 3);
    expect(regained.height).toBeCloseTo(cropRect.height, 3);
  });

  it('also restores rotated photos faithfully', () => {
    const cropRect = { x: 100, y: 500, width: 3000, height: 3000 * aspect }; // original-space rect for a 90° photo (axes swapped), inside the photo
    const state = stateFromCustomizations(t, [
      { slotIndex: 0, uploadId: 'up_1', photoWidth: 4032, photoHeight: 3024, transformJson: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 90, cropRect } },
    ]);
    const p = state.slots.photo_01;
    const regained = cropRectInOriginalPx(p.width, p.height, p.rotation, aspect, p.transform);
    expect(regained.x).toBeCloseTo(cropRect.x, 3);
    expect(regained.y).toBeCloseTo(cropRect.y, 3);
  });

  it('maps text fields and ignores customizations for slots the template does not have', () => {
    const state = stateFromCustomizations(t, [
      { slotIndex: 0, uploadId: 'up_1', photoWidth: 4000, photoHeight: 3000, transformJson: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, cropRect: { x: 0, y: 0, width: 2000, height: 3000 } }, textFieldsJson: { caption: { value: 'Hello', fontFamily: 'Serif', color: '#000' }, unknown: { value: 'x', fontFamily: 'a', color: 'b' } } },
      { slotIndex: 9, uploadId: 'up_9', photoWidth: 10, photoHeight: 10, transformJson: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, cropRect: { x: 0, y: 0, width: 1, height: 1 } } },
    ]);
    expect(Object.keys(state.slots)).toEqual(['photo_01']);
    expect(state.texts).toEqual({ caption: { value: 'Hello', fontFamily: 'Serif', color: '#000' } });
  });

  it('a legacy order is judged by the same completeness rules as a new one', () => {
    const state = stateFromCustomizations(t, [
      { slotIndex: 0, uploadId: 'up_1', photoWidth: 6000, photoHeight: 4500, transformJson: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, cropRect: { x: 0, y: 0, width: 2000, height: 2000 / aspect } }, textFieldsJson: { caption: { value: 'Hi', fontFamily: 'f', color: 'c' } } },
    ]);
    const result = checkCompleteness(t, state);
    expect(result.complete).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/Photo 2/);
  });
});

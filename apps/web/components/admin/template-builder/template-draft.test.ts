import { describe, it, expect } from 'vitest';
import { detectPhotoSlots, templateDraftFromDetection, validateTemplate, type PersonalizationTemplate } from '@bro-pics/shared';
import {
  addCalendarSlot,
  addPhotoSlot,
  addTextSlot,
  artworkAbovePhotos,
  clampBox,
  duplicatePhotoSlot,
  movePhotoSlot,
  removeSlot,
  setArtworkAbovePhotos,
  setPrintSize,
  templateIdFromName,
  updateCalendarSlot,
  updatePhotoSlot,
} from './template-draft';

/** A draft as the "new collage from image" flow makes it: two placeholders under the artwork. */
function detectedDraft(): PersonalizationTemplate {
  const w = 300;
  const h = 200;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const box = (x0: number, y0: number, bw: number, bh: number) => {
    for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) data.fill(180, (y * w + x) * 4, (y * w + x) * 4 + 3);
  };
  box(20, 20, 120, 160);
  box(160, 20, 120, 160);
  return templateDraftFromDetection({
    id: 'two-up-abcd',
    name: 'Two up',
    artwork: { assetId: 'media_1' },
    canvas: { width: 3000, height: 2000 },
    detection: detectPhotoSlots({ width: w, height: h, data }),
  });
}

describe('template builder edits', () => {
  it('keeps a moved or resized space inside the design', () => {
    expect(clampBox({ x: 0.9, y: -0.2, width: 0.3, height: 0.5 })).toEqual({ x: 0.7, y: 0, width: 0.3, height: 0.5 });
    expect(clampBox({ x: 0.2, y: 0.2, width: 0, height: 2 })).toEqual({ x: 0.2, y: 0, width: 0.01, height: 1 });
  });

  it('adds a space with the other photos (under artwork that sits on top) and it validates', () => {
    let t = setArtworkAbovePhotos(detectedDraft(), true);
    const added = addPhotoSlot(t);
    t = added.template;
    expect(t.photoSlots).toHaveLength(3);
    expect(t.layers.map((l) => (l.kind === 'fixed' ? 'art' : l.slotId))).toEqual(['photo_01', 'photo_02', added.id, 'art']);
    expect(validateTemplate(t).issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('adds text on top, duplicates and removes spaces without leaving stray layers', () => {
    let t = detectedDraft();
    const text = addTextSlot(t);
    t = text.template;
    expect(t.layers[t.layers.length - 1]).toEqual({ kind: 'text', slotId: text.id });
    const dup = duplicatePhotoSlot(t, 'photo_01');
    t = dup.template;
    expect(t.photoSlots.find((s) => s.id === dup.id)?.label).toBe('Photo 1 copy');
    t = removeSlot(removeSlot(t, dup.id), text.id);
    expect(t.layers.some((l) => l.kind !== 'fixed' && (l.slotId === dup.id || l.slotId === text.id))).toBe(false);
    expect(validateTemplate(t).valid).toBe(true);
  });

  it('adds a calendar on top that survives moving the artwork, and removes it cleanly', () => {
    const added = addCalendarSlot(detectedDraft());
    let t = added.template;
    expect(t.calendarSlots).toEqual([expect.objectContaining({ id: 'calendar_03', label: 'Your special date', mark: 'heart', weekStart: 'sunday' })]);
    expect(t.layers[t.layers.length - 1]).toEqual({ kind: 'calendar', slotId: added.id });
    expect(validateTemplate(t).valid).toBe(true);
    t = updateCalendarSlot(t, added.id, { x: 0.95, markColor: '#000000' });
    expect(t.calendarSlots![0].x + t.calendarSlots![0].width).toBeLessThanOrEqual(1);
    expect(t.calendarSlots![0].markColor).toBe('#000000');
    // Artwork moved over the photos: the calendar still stays on top.
    t = setArtworkAbovePhotos(t, true);
    expect(t.layers[t.layers.length - 1]).toEqual({ kind: 'calendar', slotId: added.id });
    // A photo added later goes under it.
    t = addPhotoSlot(t).template;
    expect(t.layers[t.layers.length - 1]).toEqual({ kind: 'calendar', slotId: added.id });
    t = removeSlot(t, added.id);
    expect(t.calendarSlots).toEqual([]);
    expect(t.layers.some((l) => l.kind === 'calendar')).toBe(false);
  });

  it('switches the artwork between over and under the photos', () => {
    const t = detectedDraft();
    expect(artworkAbovePhotos(t)).toBe(false);
    const over = setArtworkAbovePhotos(t, true);
    expect(artworkAbovePhotos(over)).toBe(true);
    expect(over.layers.find((l) => l.kind === 'fixed')).toMatchObject({ role: 'frame' });
    expect(artworkAbovePhotos(setArtworkAbovePhotos(over, false))).toBe(false);
  });

  it('turns a print size into canvas pixels and edits slot geometry', () => {
    const t = setPrintSize(detectedDraft(), 12, 8, 300);
    expect(t.canvas).toMatchObject({ width: 3600, height: 2400, dpi: 300 });
    const moved = updatePhotoSlot(t, 'photo_01', { x: 0.5, rotationDeg: 4 });
    expect(moved.photoSlots[0]).toMatchObject({ x: 0.5, rotationDeg: 4 });
  });

  it('changes the fill order and renumbers default names', () => {
    const t = movePhotoSlot(detectedDraft(), 'photo_02', -1);
    expect(t.photoSlots.map((s) => s.id)).toEqual(['photo_02', 'photo_01']);
    expect(t.photoSlots.map((s) => s.label)).toEqual(['Photo 1', 'Photo 2']);
    expect(movePhotoSlot(t, 'photo_02', -1)).toBe(t);
  });

  it('makes URL-safe ids from names', () => {
    expect(templateIdFromName('Forever & Always — 12 photos!', () => 0)).toBe('forever-always-12-photos-0000');
    expect(templateIdFromName('***', () => 0.5)).toMatch(/^design-[0-9a-z]{4}$/);
  });
});

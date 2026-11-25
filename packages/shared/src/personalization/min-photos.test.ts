import { describe, it, expect } from 'vitest';
import { checkCompleteness } from './completeness';
import { createEmptyState, setSlotPhoto } from './state';
import { complexCollageTemplate, sixPhotoTemplate } from './test-fixtures';
import { validateTemplate } from './validate-template';
import type { PersonalizationTemplate } from './template-schema';

const photo = (n: number) => ({ assetId: `up_${n}`, url: `https://cdn.example/up_${n}.jpg`, width: 6000, height: 4500 });

/** One required main photo + 28 optional collage cells, at least 6 of which must be filled. */
const atLeastSix: PersonalizationTemplate = {
  ...complexCollageTemplate,
  minPhotos: 6,
  photoSlots: complexCollageTemplate.photoSlots.map((s, i) => ({ ...s, required: i === 0 })),
};
const [main, ...cells] = atLeastSix.photoSlots;

describe('minPhotos: "at least N photos" collages', () => {
  it('without minPhotos nothing changes: no count, the old per-space rules', () => {
    const r = checkCompleteness(sixPhotoTemplate, createEmptyState(sixPhotoTemplate.id, sixPhotoTemplate.version));
    expect(r.photoCount).toBeUndefined();
    expect(r.blockers).toHaveLength(6);
  });

  it('counts only the optional collage cells, and blocks until the minimum is met, saying how many more', () => {
    let s = setSlotPhoto(createEmptyState(atLeastSix.id, atLeastSix.version), main.id, photo(0));
    for (let i = 0; i < 4; i++) s = setSlotPhoto(s, cells[i].id, photo(i + 1));
    const r = checkCompleteness(atLeastSix, s);
    expect(r.photoCount).toEqual({ filled: 4, min: 6, max: 28 });
    expect(r.complete).toBe(false);
    expect(r.blockers).toEqual(['Add at least 6 photos to the collage (2 more needed).']);
  });

  it('is complete at the minimum, without filling every cell and without noisy "empty (optional)" notes', () => {
    let s = setSlotPhoto(createEmptyState(atLeastSix.id, atLeastSix.version), main.id, photo(0));
    for (let i = 0; i < 6; i++) s = setSlotPhoto(s, cells[i].id, photo(i + 1));
    const r = checkCompleteness(atLeastSix, s);
    expect(r.complete).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('the main photo is still asked for on its own', () => {
    let s = createEmptyState(atLeastSix.id, atLeastSix.version);
    for (let i = 0; i < 6; i++) s = setSlotPhoto(s, cells[i].id, photo(i + 1));
    const r = checkCompleteness(atLeastSix, s);
    expect(r.complete).toBe(false);
    expect(r.blockers[0]).toContain(main.label);
  });

  it('photos sent on WhatsApp after ordering do not block', () => {
    const s = { ...createEmptyState(atLeastSix.id, atLeastSix.version), photosVia: 'whatsapp' as const };
    expect(checkCompleteness(atLeastSix, s).complete).toBe(true);
  });

  it('a template cannot ask for more photos than it has optional spaces', () => {
    const r = validateTemplate({ ...atLeastSix, minPhotos: 29 });
    expect(r.issues.map((i) => i.code)).toContain('min_photos_too_high');
    expect(validateTemplate(atLeastSix).issues.map((i) => i.code)).not.toContain('min_photos_too_high');
  });
});

describe('repeat fill on an "at least N photos" collage', () => {
  it('never puts a repeated photo into the main (required) space, even one that is not a cut-out', async () => {
    const { repeatPhotosIntoEmpty } = await import('./repeat-fill');
    let s = createEmptyState(atLeastSix.id, atLeastSix.version);
    s = setSlotPhoto(s, cells[0].id, photo(1));
    s = setSlotPhoto(s, cells[1].id, photo(2));
    const filled = repeatPhotosIntoEmpty(atLeastSix, s).state;
    expect(filled.slots[main.id]).toBeUndefined();
    expect(cells.every((c) => filled.slots[c.id])).toBe(true);
    // Without minPhotos (an older mosaic whose spaces are all required) every space is still filled.
    const older = { ...atLeastSix, minPhotos: undefined };
    expect(repeatPhotosIntoEmpty(older, s).state.slots[main.id]).toBeDefined();
  });
});

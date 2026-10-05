import { describe, it, expect } from 'vitest';
import {
  clearSlot, confirmLowDpi, createEmptyState, deserializeState, resetSlotTransform, serializeState, setSlotPhoto,
  setSlotRotation, setSlotTransform, setText, stateFingerprint,
} from './state';
import { checkCompleteness } from './completeness';
import { photoPlusTextTemplate, singlePhotoTemplate, sixPhotoTemplate } from './test-fixtures';
import { slotAspectRatio } from './geometry';

const photo = (n: number, w = 4000, h = 3000) => ({ assetId: `up_${n}`, url: `https://cdn.example/up_${n}.jpg?sig=abc`, width: w, height: h });

describe('personalization state', () => {
  it('starts empty and pinned to a template version', () => {
    const s = createEmptyState('six-grid', 3);
    expect(s).toMatchObject({ templateId: 'six-grid', templateVersion: 3, slots: {}, texts: {} });
  });

  it('puts a photo in a slot with the automatic cover-fit', () => {
    const s = setSlotPhoto(createEmptyState('t', 1), 'photo_01', photo(1));
    expect(s.slots.photo_01).toMatchObject({ assetId: 'up_1', transform: { scale: 1, offsetX: 0, offsetY: 0 }, rotation: 0, confirmedLowDpi: false });
  });

  it('never mutates its input (updaters return new states)', () => {
    const a = createEmptyState('t', 1);
    const frozen = JSON.stringify(a);
    const b = setSlotPhoto(a, 'photo_01', photo(1));
    setText(b, 'name', { value: 'x' });
    expect(JSON.stringify(a)).toBe(frozen);
    expect(b).not.toBe(a);
  });

  it('replacing a photo resets pan/zoom/rotation and the low-dpi acceptance for THAT slot only', () => {
    let s = setSlotPhoto(createEmptyState('t', 1), 'photo_01', photo(1));
    s = setSlotPhoto(s, 'photo_02', photo(2));
    s = setSlotTransform(s, 'photo_01', { scale: 2, offsetX: 0.1, offsetY: 0 }, 1);
    s = confirmLowDpi(s, 'photo_01', true);
    s = setSlotPhoto(s, 'photo_01', photo(3));
    expect(s.slots.photo_01).toMatchObject({ assetId: 'up_3', transform: { scale: 1, offsetX: 0, offsetY: 0 }, confirmedLowDpi: false });
    expect(s.slots.photo_02.assetId).toBe('up_2');
  });

  it('clamps pan so the photo keeps covering the slot, and ignores edits to an empty slot', () => {
    let s = setSlotPhoto(createEmptyState('t', 1), 'photo_01', photo(1));
    s = setSlotTransform(s, 'photo_01', { scale: 1.5, offsetX: 50, offsetY: 50 }, 1);
    expect(Math.abs(s.slots.photo_01.transform.offsetX)).toBeLessThan(1);
    const same = setSlotTransform(s, 'photo_09', { scale: 2, offsetX: 0, offsetY: 0 }, 1);
    expect(same).toBe(s);
  });

  it('rotating resets the placement (it was relative to the old orientation); reset restores the fit', () => {
    let s = setSlotPhoto(createEmptyState('t', 1), 'photo_01', photo(1));
    s = setSlotTransform(s, 'photo_01', { scale: 2, offsetX: 0.1, offsetY: 0.1 }, 1);
    s = setSlotRotation(s, 'photo_01', 90);
    expect(s.slots.photo_01).toMatchObject({ rotation: 90, transform: { scale: 1, offsetX: 0, offsetY: 0 } });
    s = setSlotTransform(s, 'photo_01', { scale: 3, offsetX: 0, offsetY: 0 }, 1);
    expect(resetSlotTransform(s, 'photo_01').slots.photo_01.transform.scale).toBe(1);
  });

  it('removes a photo', () => {
    let s = setSlotPhoto(createEmptyState('t', 1), 'photo_01', photo(1));
    s = clearSlot(s, 'photo_01');
    expect(s.slots).toEqual({});
  });
});

describe('serialization', () => {
  it('round-trips exactly through JSON', () => {
    let s = setSlotPhoto(createEmptyState('six-grid', 2), 'photo_01', photo(1));
    s = setSlotTransform(s, 'photo_01', { scale: 1.7, offsetX: 0.05, offsetY: -0.02 }, 0.9);
    s = setText(s, 'name', { value: 'Asha & Ravi', fontFamily: 'Playfair', color: '#222' });
    const result = deserializeState(serializeState(s));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toEqual(s);
  });

  it('never persists inline base64 images (carts/orders must stay small)', () => {
    const s = setSlotPhoto(createEmptyState('t', 1), 'photo_01', { ...photo(1), url: 'data:image/jpeg;base64,AAAA' });
    expect(() => serializeState(s)).toThrow(/inline/);
  });

  it.each([['not json {', 'not valid JSON'], ['{"templateId":1}', 'invalid'], [null, 'invalid'], [42, 'invalid']])(
    'turns a corrupt blob (%j) into a recoverable error instead of throwing',
    (...args: unknown[]) => {
      const result = deserializeState(args[0] as never);
      expect(result.ok).toBe(false);
    }
  );

  it('fills defaults for older/partial blobs (forward compatible)', () => {
    const result = deserializeState({ templateId: 't', templateVersion: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toMatchObject({ slots: {}, texts: {}, schemaVersion: 1 });
  });
});

describe('fingerprint (drives cache keys and "did the preview change?")', () => {
  it('is stable for the same content regardless of key order and rotating signed-URL tokens', () => {
    const a = setSlotPhoto(setSlotPhoto(createEmptyState('t', 1), 'photo_02', photo(2)), 'photo_01', photo(1));
    const b = setSlotPhoto(setSlotPhoto(createEmptyState('t', 1), 'photo_01', { ...photo(1), url: 'https://cdn.example/up_1.jpg?sig=DIFFERENT' }), 'photo_02', photo(2));
    expect(stateFingerprint(a)).toBe(stateFingerprint(b));
  });

  it.each([
    ['a different photo', (s: ReturnType<typeof createEmptyState>) => setSlotPhoto(s, 'photo_01', photo(9))],
    ['a different crop', (s: ReturnType<typeof createEmptyState>) => setSlotTransform(s, 'photo_01', { scale: 2, offsetX: 0, offsetY: 0 }, 1)],
    ['a rotation', (s: ReturnType<typeof createEmptyState>) => setSlotRotation(s, 'photo_01', 180)],
    ['different text', (s: ReturnType<typeof createEmptyState>) => setText(s, 'name', { value: 'changed' })],
  ])('changes when %s changes', (_name, change) => {
    const base = setText(setSlotPhoto(createEmptyState('t', 1), 'photo_01', photo(1)), 'name', { value: 'x' });
    expect(stateFingerprint(change(base))).not.toBe(stateFingerprint(base));
  });
});

describe('completeness (one rule for the editor, add-to-cart and the server)', () => {
  it('blocks until every required photo slot is filled, naming what is missing', () => {
    const empty = checkCompleteness(sixPhotoTemplate, createEmptyState(sixPhotoTemplate.id, sixPhotoTemplate.version));
    expect(empty.complete).toBe(false);
    expect(empty.blockers).toHaveLength(6);
    expect(empty.blockers[0]).toContain('Photo 1');
  });

  it('is complete once all slots hold sharp-enough photos', () => {
    let s = createEmptyState(sixPhotoTemplate.id, sixPhotoTemplate.version);
    for (const slot of sixPhotoTemplate.photoSlots) s = setSlotPhoto(s, slot.id, photo(1, 6000, 4500));
    const result = checkCompleteness(sixPhotoTemplate, s);
    expect(result.blockers).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it('a low-resolution photo blocks until the customer accepts the warning for THAT photo, then only warns', () => {
    const slot = singlePhotoTemplate.photoSlots[0];
    let s = setSlotPhoto(createEmptyState(singlePhotoTemplate.id, singlePhotoTemplate.version), slot.id, photo(1, 600, 800));
    let result = checkCompleteness(singlePhotoTemplate, s);
    expect(result.complete).toBe(false);
    expect(result.slots[0].tier).toBe('red');
    expect(result.slots[0].message).toMatch(/low quality/i);
    s = confirmLowDpi(s, slot.id, true);
    result = checkCompleteness(singlePhotoTemplate, s);
    expect(result.complete).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/low-resolution/);
  });

  it('zooming a good photo in can drop it into the red band — completeness reacts to the crop, not just the upload', () => {
    const slot = singlePhotoTemplate.photoSlots[0];
    const aspect = slotAspectRatio(slot, singlePhotoTemplate.canvas);
    let s = setSlotPhoto(createEmptyState(singlePhotoTemplate.id, singlePhotoTemplate.version), slot.id, photo(1, 2000, 2000));
    const before = checkCompleteness(singlePhotoTemplate, s).slots[0].dpi!;
    s = setSlotTransform(s, slot.id, { scale: 4, offsetX: 0, offsetY: 0 }, aspect);
    expect(checkCompleteness(singlePhotoTemplate, s).slots[0].dpi!).toBeLessThan(before / 3);
  });

  it('requires required text and enforces the max length', () => {
    const base = setSlotPhoto(createEmptyState(photoPlusTextTemplate.id, 1), 'photo_01', photo(1, 6000, 6000));
    expect(checkCompleteness(photoPlusTextTemplate, base).blockers.join(' ')).toMatch(/Enter “Names”/);
    const tooLong = setText(base, 'name', { value: 'x'.repeat(40) });
    expect(checkCompleteness(photoPlusTextTemplate, tooLong).blockers.join(' ')).toMatch(/too long/);
    const ok = setText(base, 'name', { value: 'Asha & Ravi' });
    expect(checkCompleteness(photoPlusTextTemplate, ok).complete).toBe(true);
  });
});

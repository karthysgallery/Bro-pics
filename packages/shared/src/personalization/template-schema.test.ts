import { describe, it, expect } from 'vitest';
import { validateTemplate, assertPublishable } from './validate-template';
import { ALL_REPRESENTATIVE_TEMPLATES, complexCollageTemplate, singlePhotoTemplate, photoPlusTextTemplate } from './test-fixtures';
import type { PersonalizationTemplate } from './template-schema';

const clone = (t: PersonalizationTemplate): PersonalizationTemplate => JSON.parse(JSON.stringify(t));
const codes = (t: unknown, opts = {}) => validateTemplate(t, opts).issues.filter((i) => i.severity === 'error').map((i) => i.code);

describe('template validation', () => {
  it.each(ALL_REPRESENTATIVE_TEMPLATES.map((t) => [t.id, t] as const))('accepts the representative template %s', (_id, template) => {
    const result = validateTemplate(template);
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('the complex collage really has 29 distinct photo slots', () => {
    expect(complexCollageTemplate.photoSlots).toHaveLength(29);
    expect(new Set(complexCollageTemplate.photoSlots.map((s) => s.id)).size).toBe(29);
  });

  it('rejects structurally invalid input with a schema error instead of throwing', () => {
    const result = validateTemplate({ id: 'x' });
    expect(result.valid).toBe(false);
    expect(result.template).toBeNull();
    expect(result.issues[0].code).toBe('schema');
  });

  it('rejects duplicate slot ids (across photo and text slots)', () => {
    const t = clone(photoPlusTextTemplate);
    t.textSlots[0].id = t.photoSlots[0].id;
    expect(codes(t)).toContain('duplicate_slot_id');
  });

  it('rejects slots that extend beyond the canvas', () => {
    const t = clone(singlePhotoTemplate);
    t.photoSlots[0].x = 0.5;
    t.photoSlots[0].width = 0.8;
    expect(codes(t)).toContain('out_of_canvas');
  });

  it('rejects zero/negative-size slots and coordinates outside 0-1', () => {
    const zero = clone(singlePhotoTemplate);
    zero.photoSlots[0].width = 0;
    expect(validateTemplate(zero).valid).toBe(false);
    const negative = clone(singlePhotoTemplate);
    negative.photoSlots[0].x = -0.1;
    expect(validateTemplate(negative).valid).toBe(false);
  });

  it('rejects a photo slot that is missing from the layer stack (it would never be drawn)', () => {
    const t = clone(complexCollageTemplate);
    t.layers = t.layers.filter((l) => !(l.kind === 'photoSlot' && l.slotId === 'photo_05'));
    expect(codes(t)).toContain('slot_not_in_layers');
  });

  it('rejects a slot drawn twice, and layers that point at unknown slots', () => {
    const twice = clone(singlePhotoTemplate);
    twice.layers.push({ kind: 'photoSlot', slotId: 'photo_01' });
    expect(codes(twice)).toContain('slot_in_layers_twice');
    const unknown = clone(singlePhotoTemplate);
    unknown.layers.push({ kind: 'photoSlot', slotId: 'ghost' });
    expect(codes(unknown)).toContain('layer_unknown_slot');
  });

  it('requires a mask asset for mask-shaped slots, and a real polygon for polygon slots', () => {
    const noMask = clone(singlePhotoTemplate);
    noMask.photoSlots[0].shape = 'mask';
    expect(codes(noMask)).toContain('mask_missing');
    const polyTooFew = clone(singlePhotoTemplate);
    polyTooFew.photoSlots[0].shape = 'polygon';
    expect(codes(polyTooFew)).toContain('polygon_needs_points');
  });

  it('when told how to check assets, rejects missing masks and missing layer assets (publish-time check)', () => {
    const t = clone(singlePhotoTemplate);
    t.photoSlots[0].shape = 'mask';
    t.photoSlots[0].mask = { assetId: 'mask-gone' };
    const exists = (id: string) => id !== 'mask-gone' && id !== 'frame-single-8x12';
    const errs = codes(t, { assetExists: exists });
    expect(errs).toContain('mask_asset_missing');
    expect(errs).toContain('asset_missing');
    // ...but the shape-only check used by the live builder does not need storage access.
    expect(codes(t)).not.toContain('asset_missing');
  });

  it('warns (without blocking) about overlapping and tiny slots', () => {
    const t = clone(singlePhotoTemplate);
    t.photoSlots.push({ ...t.photoSlots[0], id: 'photo_02', label: 'Overlap' });
    t.layers.push({ kind: 'photoSlot', slotId: 'photo_02' });
    const result = validateTemplate(t);
    expect(result.valid).toBe(true);
    expect(result.issues.map((i) => i.code)).toContain('overlapping_slots');
  });

  it('assertPublishable returns the template when valid and throws a readable list when not', () => {
    expect(assertPublishable(singlePhotoTemplate).id).toBe('single-8x12');
    const bad = clone(singlePhotoTemplate);
    bad.layers = bad.layers.filter((l) => l.kind !== 'photoSlot');
    expect(() => assertPublishable(bad)).toThrow(/cannot be published[\s\S]*never be drawn/);
  });
});

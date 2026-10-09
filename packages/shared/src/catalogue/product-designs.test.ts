import { describe, it, expect } from 'vitest';
import { shapeLabel, artworkDpi, artworkKept, buildReadyMadeTemplate, buildSinglePhotoTemplate, centreCrop, designId, groupSizesByShape, shapeKey } from './product-designs';
import { validateTemplate } from '../personalization/validate-template';
import { checkCompleteness } from '../personalization/completeness';
import { createEmptyState } from '../personalization/state';
import { buildOrderSnapshot } from '../personalization/versioning';

describe('auto-made product designs', () => {
  it('groups sizes by print shape and draws each shape at its largest size', () => {
    const groups = groupSizesByShape([
      { widthIn: 8, heightIn: 12 },
      { widthIn: 12, heightIn: 18 },
      { widthIn: 8, heightIn: 10 },
      { widthIn: 12, heightIn: 8 },
    ]);
    expect(groups.map((g) => [g.key, g.largest, g.sizes.length])).toEqual([
      ['P1.50', { widthIn: 12, heightIn: 18 }, 2],
      ['P1.25', { widthIn: 8, heightIn: 10 }, 1],
      ['L1.50', { widthIn: 12, heightIn: 8 }, 1],
    ]);
    expect(shapeKey({ widthIn: 6, heightIn: 6 })).toBe('L1.00');
    expect([shapeLabel({ widthIn: 12, heightIn: 18 }), shapeLabel({ widthIn: 10, heightIn: 8 }), shapeLabel({ widthIn: 6, heightIn: 6 }), shapeLabel({ widthIn: 12, heightIn: 15 })]).toEqual(['2:3 portrait', '5:4 landscape', 'square', '4:5 portrait']);
  });

  it('a ready-made design has no customer slots, is valid, is complete as is, and prints its artwork', () => {
    const t = buildReadyMadeTemplate({ productId: 'murugan', name: 'Lord Murugan', size: { widthIn: 12, heightIn: 18 }, artwork: { assetId: 'media_1', url: 'https://x/a.jpg' } });
    expect(t).toMatchObject({ id: 'murugan-p1_50', type: 'ready_made', photoSlots: [], canvas: { width: 3600, height: 5400 } });
    expect(validateTemplate(t).valid).toBe(true);
    const state = createEmptyState(t.id, t.version);
    expect(checkCompleteness(t, state).complete).toBe(true);
    const snap = buildOrderSnapshot(t, state);
    expect(snap.template.layers).toEqual([expect.objectContaining({ kind: 'fixed', printed: true, asset: expect.objectContaining({ assetId: 'media_1' }) })]);
  });

  it('only a ready-made design may have no slots, and it must carry printed artwork', () => {
    const t = buildReadyMadeTemplate({ productId: 'p', name: 'p', size: { widthIn: 8, heightIn: 12 }, artwork: { assetId: 'a' } });
    expect(validateTemplate({ ...t, type: 'single_photo' }).issues.map((i) => i.code)).toContain('no_slots');
    expect(validateTemplate({ ...t, layers: [{ ...t.layers[0], printed: false }] }).issues.map((i) => i.code)).toContain('no_artwork');
  });

  it('a single-photo design is one full-bleed photo that must be filled', () => {
    const t = buildSinglePhotoTemplate({ productId: 'classic', name: 'Classic', size: { widthIn: 8, heightIn: 10 } });
    expect(validateTemplate(t).valid).toBe(true);
    expect(t.photoSlots).toEqual([expect.objectContaining({ x: 0, y: 0, width: 1, height: 1, required: true })]);
    expect(checkCompleteness(t, createEmptyState(t.id, t.version)).complete).toBe(false);
    expect(designId('classic', { widthIn: 8, heightIn: 10 })).toBe(t.id);
  });

  it('crops artwork to each shape from the centre and reports its print sharpness', () => {
    const img = { width: 4000, height: 5000 }; // 4:5
    expect(centreCrop(img, { widthIn: 8, heightIn: 10 })).toEqual({ left: 0, top: 0, width: 4000, height: 5000 });
    expect(centreCrop(img, { widthIn: 12, heightIn: 18 })).toEqual({ left: 333, top: 0, width: 3333, height: 5000 });
    expect(artworkDpi(img, { widthIn: 8, heightIn: 10 })).toBe(500);
    expect(artworkDpi(img, { widthIn: 20, heightIn: 30 })).toBe(166);
    expect(artworkKept(img, { widthIn: 12, heightIn: 18 })).toBeCloseTo(0.833, 2);
  });
});

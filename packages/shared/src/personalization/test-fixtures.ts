import { PersonalizationTemplateSchema, type PersonalizationTemplate } from './template-schema';

/** Builds a valid template from a list of photo rects, with a background, a printed border and (optionally) text. */
function make(
  id: string,
  type: PersonalizationTemplate['type'],
  canvas: { width: number; height: number },
  rects: Array<{ x: number; y: number; width: number; height: number; shape?: 'rect' | 'ellipse' | 'rounded' }>,
  withText = false
): PersonalizationTemplate {
  const photoSlots = rects.map((r, i) => ({
    id: `photo_${String(i + 1).padStart(2, '0')}`,
    label: rects.length === 1 ? 'Your photo' : `Photo ${i + 1}`,
    required: true,
    ...r,
    shape: r.shape ?? 'rect',
    ...(r.shape === 'rounded' && { cornerRadius: 0.1 }),
  }));
  const textSlots = withText
    ? [{ id: 'name', label: 'Names', required: true, x: 0.2, y: 0.82, width: 0.6, height: 0.1, maxLength: 24, align: 'center' as const, defaultValue: '' }]
    : [];
  return PersonalizationTemplateSchema.parse({
    id,
    version: 1,
    status: 'published',
    type,
    name: id,
    canvas: { ...canvas, dpi: 300 },
    photoSlots,
    textSlots,
    layers: [
      { kind: 'fixed', id: 'bg', role: 'background', asset: { assetId: `bg-${id}` }, printed: true },
      ...photoSlots.map((s) => ({ kind: 'photoSlot', slotId: s.id })),
      { kind: 'fixed', id: 'frame', role: 'frame', asset: { assetId: `frame-${id}` }, printed: false },
      ...textSlots.map((s) => ({ kind: 'text', slotId: s.id })),
    ],
  });
}

/** 1 photo, portrait 8x12 in. */
export const singlePhotoTemplate = make('single-8x12', 'single_photo', { width: 2400, height: 3600 }, [{ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }]);

/** 3 photos in a row, landscape. */
export const threePhotoTemplate = make('trio-12x8', 'multi_photo', { width: 3600, height: 2400 }, [
  { x: 0.05, y: 0.2, width: 0.28, height: 0.6 },
  { x: 0.36, y: 0.2, width: 0.28, height: 0.6 },
  { x: 0.67, y: 0.2, width: 0.28, height: 0.6, shape: 'rounded' },
]);

/** 6 photos in a 3x2 grid. */
export const sixPhotoTemplate = make(
  'six-grid',
  'collage',
  { width: 3600, height: 2400 },
  Array.from({ length: 6 }, (_, i) => ({ x: 0.04 + (i % 3) * 0.32, y: 0.05 + Math.floor(i / 3) * 0.47, width: 0.28, height: 0.42 }))
);

/** Complex: one hero photo + 28 small ones (29 slots), like a "Forever and Always" style collage. Synthetic — NOT the real design. */
export const complexCollageTemplate = make('hero-collage-29', 'hero_collage', { width: 6000, height: 4000 }, [
  { x: 0.3, y: 0.15, width: 0.4, height: 0.7 },
  ...Array.from({ length: 28 }, (_, i) => {
    const left = i < 14;
    const idx = i % 14;
    return { x: (left ? 0.02 : 0.72) + (idx % 2) * 0.13, y: 0.03 + Math.floor(idx / 2) * 0.135, width: 0.12, height: 0.12, shape: 'ellipse' as const };
  }),
]);

/** Photo + a required text line. */
export const photoPlusTextTemplate = make('names-8x10', 'text_plus_photo', { width: 2400, height: 3000 }, [{ x: 0.1, y: 0.08, width: 0.8, height: 0.68 }], true);

export const ALL_REPRESENTATIVE_TEMPLATES = [singlePhotoTemplate, threePhotoTemplate, sixPhotoTemplate, complexCollageTemplate, photoPlusTextTemplate];

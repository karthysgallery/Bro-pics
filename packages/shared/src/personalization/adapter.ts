import type { FrameTemplate } from '../schemas/frame-template';
import type { Customization } from '../schemas/customization';
import type { PersonalizationTemplate } from './template-schema';
import { PersonalizationTemplateSchema } from './template-schema';
import { rectToRotatedSpace, slotAspectRatio, transformFromVisibleRegion, type Rotation } from './geometry';
import { PersonalizationStateSchema, STATE_SCHEMA_VERSION, type PersonalizationState } from './state';

/**
 * Lossless bridge from today's per-variant FrameTemplate to a v2 template, so
 * every existing product renders through the new engine unchanged — no data
 * migration, no second template model.
 *
 * A legacy template's `mockupUrl` is BOTH the frame graphic and part of the
 * print file (it is composited into the print render), so it maps to a fixed
 * layer with `printed: true`, preserving today's print output exactly.
 */
export function fromFrameTemplate(
  frame: Pick<FrameTemplate, 'id' | 'mockupUrl' | 'overlayUrl' | 'maskUrl' | 'printableRects' | 'textZones' | 'version' | 'bleedMm'>,
  options: { templateId: string; name: string; canvasWidthPx: number; canvasHeightPx: number; dpi?: number }
): PersonalizationTemplate {
  const photoSlots = [...frame.printableRects]
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((r) => ({
      id: `photo_${String(r.slotIndex + 1).padStart(2, '0')}`,
      label: frame.printableRects.length === 1 ? 'Your photo' : `Photo ${r.slotIndex + 1}`,
      required: true,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      rotationDeg: 0,
      shape: frame.maskUrl ? ('mask' as const) : ('rect' as const),
      ...(frame.maskUrl && { mask: { assetId: `legacy-mask:${frame.id}`, url: frame.maskUrl } }),
      fit: 'cover' as const,
      ...(r.widthMm && { widthMm: r.widthMm }),
      ...(r.heightMm && { heightMm: r.heightMm }),
    }));

  const textSlots = frame.textZones.map((z) => ({
    id: z.fieldKey,
    label: z.label,
    required: z.required ?? false,
    x: z.x,
    y: z.y,
    width: z.width,
    height: z.height,
    maxLength: z.maxLength,
    align: z.align,
    defaultValue: '',
    ...(z.defaultFontFamily && { defaultFontFamily: z.defaultFontFamily }),
    ...(z.defaultColor && { defaultColor: z.defaultColor }),
    ...(z.allowedFonts && { allowedFonts: z.allowedFonts }),
    ...(z.allowedColors && { allowedColors: z.allowedColors }),
    ...(z.minFontSizePx && { minFontSizePx: z.minFontSizePx }),
    ...(z.maxFontSizePx && { maxFontSizePx: z.maxFontSizePx }),
  }));

  // Legacy paint order: photos -> mockup -> overlay -> text.
  const layers: PersonalizationTemplate['layers'] = [
    ...photoSlots.map((s) => ({ kind: 'photoSlot' as const, slotId: s.id })),
    { kind: 'fixed', id: 'legacy-frame', role: 'frame', asset: { assetId: `legacy-mockup:${frame.id}`, url: frame.mockupUrl }, x: 0, y: 0, width: 1, height: 1, printed: true },
    ...(frame.overlayUrl
      ? [{ kind: 'fixed' as const, id: 'legacy-overlay', role: 'foreground' as const, asset: { assetId: `legacy-overlay:${frame.id}`, url: frame.overlayUrl }, x: 0, y: 0, width: 1, height: 1, printed: true }]
      : []),
    ...textSlots.map((s) => ({ kind: 'text' as const, slotId: s.id })),
  ];

  return PersonalizationTemplateSchema.parse({
    id: options.templateId,
    version: frame.version,
    status: 'published',
    type: photoSlots.length === 1 ? 'single_photo' : photoSlots.length <= 3 ? 'multi_photo' : 'collage',
    name: options.name,
    canvas: { width: options.canvasWidthPx, height: options.canvasHeightPx, dpi: options.dpi ?? 300, bleedMm: frame.bleedMm },
    photoSlots,
    textSlots,
    layers,
  });
}

/**
 * Builds the v2 state from legacy per-slot Customization docs, so a cart line
 * saved before the engine existed opens in it. The legacy cropRect (original
 * pixels) is converted back to the normalized transform.
 */
export function stateFromCustomizations(
  template: PersonalizationTemplate,
  customizations: ReadonlyArray<
    Pick<Customization, 'slotIndex' | 'uploadId' | 'transformJson' | 'textFieldsJson'> & { photoWidth: number; photoHeight: number; url?: string; confirmedLowDpi?: boolean }
  >
): PersonalizationState {
  const slots: PersonalizationState['slots'] = {};
  for (const c of customizations) {
    const slot = template.photoSlots[c.slotIndex];
    if (!slot) continue;
    const rotation = c.transformJson.rotationDeg as Rotation;
    const aspect = slotAspectRatio(slot, template.canvas);
    const region = rectToRotatedSpace(c.transformJson.cropRect, c.photoWidth, c.photoHeight, rotation);
    slots[slot.id] = {
      assetId: c.uploadId,
      ...(c.url && { url: c.url }),
      width: c.photoWidth,
      height: c.photoHeight,
      transform: transformFromVisibleRegion(region, c.photoWidth, c.photoHeight, rotation, aspect),
      rotation,
      confirmedLowDpi: c.confirmedLowDpi ?? false,
    };
  }
  const texts: PersonalizationState['texts'] = {};
  for (const c of customizations) {
    for (const [key, v] of Object.entries(c.textFieldsJson ?? {})) {
      if (template.textSlots.some((t) => t.id === key)) texts[key] = { value: v.value, fontFamily: v.fontFamily, color: v.color };
    }
  }
  return PersonalizationStateSchema.parse({
    schemaVersion: STATE_SCHEMA_VERSION,
    templateId: template.id,
    templateVersion: template.version,
    slots,
    texts,
  });
}

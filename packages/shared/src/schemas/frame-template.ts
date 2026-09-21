import { z } from 'zod';

const fraction = z.number().min(0).max(1);

export const TextZoneSchema = z.object({
  fieldKey: z.string().min(1),
  label: z.string().min(1),
  x: fraction,
  y: fraction,
  width: fraction,
  height: fraction,
  maxLength: z.number().int().positive(),
  align: z.enum(['left', 'center', 'right']),
  defaultFontFamily: z.string().optional(),
  defaultColor: z.string().optional(),
});

export type TextZone = z.infer<typeof TextZoneSchema>;

export const ClipartOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  assetUrl: z.string().min(1),
  x: fraction,
  y: fraction,
  width: fraction,
  height: fraction,
});

export type ClipartOption = z.infer<typeof ClipartOptionSchema>;

export const FrameTemplateSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  mockupUrl: z.string().min(1),
  maskUrl: z.string().nullable(),
  overlayUrl: z.string().nullable(),
  printableRects: z
    .array(
      z.object({
        slotIndex: z.number().int().nonnegative(),
        x: fraction,
        y: fraction,
        width: fraction,
        height: fraction,
      })
    )
    .min(1),
  bleedMm: z.number().nonnegative(),
  matInset: z.number().nonnegative(),
  // Immutable version snapshots: editing a template's layout in admin
  // writes a NEW doc with version incremented and isCurrent: true, flips
  // the previous doc's isCurrent to false, and never mutates an existing
  // doc in place. A Customization pins the exact version it was built
  // against (see CustomizationSchema.templateVersion) so an existing
  // order's re-render is never affected by a later template edit.
  version: z.number().int().positive(),
  isCurrent: z.boolean(),
  // Per-product text field configuration — replaces the old one-size-
  // fits-all hardcoded [name, date] fields. Optional/defaulted to [] so a
  // template with no text personalization just omits it.
  textZones: z.array(TextZoneSchema).default([]),
  // Stock/dev-provided asset set for now; admin-uploadable later (a data
  // change, not a schema change, since this shape already supports it).
  clipartOptions: z.array(ClipartOptionSchema).default([]),
});

export type FrameTemplate = z.infer<typeof FrameTemplateSchema>;

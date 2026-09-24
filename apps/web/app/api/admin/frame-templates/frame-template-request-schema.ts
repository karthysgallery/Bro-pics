import { z } from 'zod';

const fraction = z.number().min(0).max(1);

const TextZoneBodySchema = z.object({
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
  allowedFonts: z.array(z.string()).optional(),
  allowedColors: z.array(z.string()).optional(),
  minFontSizePx: z.number().positive().optional(),
  maxFontSizePx: z.number().positive().optional(),
  required: z.boolean().optional(),
});

const ClipartOptionBodySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  assetUrl: z.string().min(1),
  x: fraction,
  y: fraction,
  width: fraction,
  height: fraction,
});

/**
 * [ABE-12] Its own `.strict()` request schema — excludes `id`, `version`,
 * and `isCurrent`, which the route computes itself inside the
 * "save as new version" transaction, never accepted from a client.
 */
export const CreateFrameTemplateBodySchema = z
  .object({
    variantId: z.string().min(1),
    mockupUrl: z.string().min(1),
    maskUrl: z.string().nullable().default(null),
    overlayUrl: z.string().nullable().default(null),
    printableRects: z
      .array(
        z.object({
          slotIndex: z.number().int().nonnegative(),
          x: fraction,
          y: fraction,
          width: fraction,
          height: fraction,
          widthMm: z.number().positive().optional(),
          heightMm: z.number().positive().optional(),
        })
      )
      .min(1),
    bleedMm: z.number().nonnegative(),
    matInset: z.number().nonnegative(),
    textZones: z.array(TextZoneBodySchema).default([]),
    clipartOptions: z.array(ClipartOptionBodySchema).default([]),
  })
  .strict();

export type CreateFrameTemplateBody = z.infer<typeof CreateFrameTemplateBodySchema>;

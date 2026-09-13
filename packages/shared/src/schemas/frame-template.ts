import { z } from 'zod';

const fraction = z.number().min(0).max(1);

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
});

export type FrameTemplate = z.infer<typeof FrameTemplateSchema>;

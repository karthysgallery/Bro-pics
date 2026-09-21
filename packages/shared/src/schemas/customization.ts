import { z } from 'zod';

export const CustomizationSchema = z.object({
  id: z.string(),
  sessionId: z.string().min(1),
  userId: z.string().min(1).optional(),
  personalizationId: z.string().min(1),
  uploadId: z.string(),
  variantId: z.string(),
  slotIndex: z.number().int().nonnegative(),
  transformJson: z.object({
    scale: z.number().positive(),
    offsetX: z.number(),
    offsetY: z.number(),
    rotationDeg: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    cropRect: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  }),
  // Value + the font/colour the customer actually picked for it — was
  // previously just the raw string, which silently discarded styling on
  // reload/re-render (editor-confirm always re-applied the DEFAULT font).
  textFieldsJson: z
    .record(z.string(), z.object({ value: z.string(), fontFamily: z.string(), color: z.string() }))
    .optional(),
  clipartId: z.string().optional(),
  effectiveDpi: z.number().nonnegative(),
  previewUrl: z.string().optional(),
  // Pins the exact FrameTemplate.version this customization was built
  // against — never the "current" template — so a later template edit
  // (which creates a new version doc rather than mutating this one) can
  // never change what an already-placed order re-renders to.
  templateVersion: z.number().int().positive(),
  // Populated by the print-render pipeline once the final, authoritative
  // 300 DPI print file has been produced server-side (see the backend
  // requirements doc) — undefined until renderStatus reaches 'done'.
  renderedFileUrl: z.string().optional(),
  renderStatus: z.enum(['pending', 'rendering', 'done', 'failed']),
});

export type Customization = z.infer<typeof CustomizationSchema>;

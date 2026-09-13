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
  textFieldsJson: z.record(z.string(), z.string()).optional(),
  effectiveDpi: z.number().nonnegative(),
  previewUrl: z.string().optional(),
  renderStatus: z.enum(['pending', 'rendering', 'done', 'failed']),
});

export type Customization = z.infer<typeof CustomizationSchema>;

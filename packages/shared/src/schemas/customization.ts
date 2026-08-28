import { z } from 'zod';

export const CustomizationSchema = z.object({
  id: z.string(),
  uploadId: z.string(),
  variantId: z.string(),
  slotIndex: z.number().int().nonnegative(),
  transformJson: z.object({
    scale: z.number().positive(),
    offsetX: z.number(),
    offsetY: z.number(),
    rotation: z.number(),
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
  printFileUrl: z.string().optional(),
  renderStatus: z.enum(['pending', 'rendering', 'done', 'failed']),
});

export type Customization = z.infer<typeof CustomizationSchema>;

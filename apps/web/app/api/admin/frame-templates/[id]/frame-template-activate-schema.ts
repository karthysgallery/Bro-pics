import { z } from 'zod';

export const ActivateFrameTemplateBodySchema = z
  .object({
    variantId: z.string().min(1),
    isCurrent: z.boolean(),
  })
  .strict();

export type ActivateFrameTemplateBody = z.infer<typeof ActivateFrameTemplateBodySchema>;

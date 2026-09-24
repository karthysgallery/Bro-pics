import { z } from 'zod';

export const CreateMediaAssetBodySchema = z
  .object({
    path: z.string().min(1),
    type: z.enum(['image', 'video']),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    alt: z.string().default(''),
    tags: z.array(z.string()).default([]),
  })
  .strict();

export type CreateMediaAssetBody = z.infer<typeof CreateMediaAssetBodySchema>;

export const UpdateMediaAssetBodySchema = z
  .object({
    alt: z.string().optional(),
    tags: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type UpdateMediaAssetBody = z.infer<typeof UpdateMediaAssetBodySchema>;

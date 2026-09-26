import { z } from 'zod';
import { VideoPlacementSchema } from '@bro-pics/shared';

export const CreateVideoBodySchema = z
  .object({
    mediaId: z.string().min(1),
    thumbnailMediaId: z.string().nullable().default(null),
    caption: z.string().default(''),
    productId: z.string().nullable().default(null),
    placement: VideoPlacementSchema,
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().nonnegative().default(0),
  })
  .strict();

export type CreateVideoBody = z.infer<typeof CreateVideoBodySchema>;

export const UpdateVideoBodySchema = CreateVideoBodySchema.partial();

export type UpdateVideoBody = z.infer<typeof UpdateVideoBodySchema>;

export const ReorderVideosBodySchema = z
  .object({
    orderedIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type ReorderVideosBody = z.infer<typeof ReorderVideosBodySchema>;

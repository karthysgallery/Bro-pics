import { z } from 'zod';

export const UpdateAnnouncementBarBodySchema = z
  .object({
    text: z.string(),
    link: z.string().nullable().default(null),
    isActive: z.boolean().default(true),
  })
  .strict();

export type UpdateAnnouncementBarBody = z.infer<typeof UpdateAnnouncementBarBodySchema>;

import { z } from 'zod';

export const UploadUrlRequestSchema = z
  .object({
    fileName: z.string().min(1),
    contentType: z.string().regex(/^(image|video)\//, 'contentType must be image/* or video/*'),
  })
  .strict();

export type UploadUrlRequest = z.infer<typeof UploadUrlRequestSchema>;

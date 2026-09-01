import { z } from 'zod';

export const UploadSchema = z.object({
  id: z.string(),
  sessionId: z.string().min(1),
  originalUrl: z.string().min(1),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  mime: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  exifStripped: z.boolean(),
  status: z.enum(['ready', 'rejected']),
});

export type Upload = z.infer<typeof UploadSchema>;

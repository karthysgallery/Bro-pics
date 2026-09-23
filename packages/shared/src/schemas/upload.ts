import { z } from 'zod';

export const UploadSchema = z.object({
  id: z.string(),
  sessionId: z.string().min(1),
  userId: z.string().min(1).optional(),
  // A Storage object path, never a signed URL — URLs expire; paths don't.
  // Clients resolve a display URL on demand via GET /api/media/url.
  originalPath: z.string().min(1),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  mime: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  exifStripped: z.boolean(),
  status: z.enum(['ready', 'rejected']),
});

export type Upload = z.infer<typeof UploadSchema>;

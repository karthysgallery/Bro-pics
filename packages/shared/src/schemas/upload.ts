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
  // [BE-35] Needed to identify stale, never-reconciled anonymous uploads
  // for TTL cleanup. Optional — a pre-existing upload written before this
  // field existed has no createdAt and is simply never a cleanup
  // candidate until a future backfill (same pattern as BE-05a's
  // storage-path migration) gives it one.
  createdAt: z.date().optional(),
});

export type Upload = z.infer<typeof UploadSchema>;

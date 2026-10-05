import { z } from 'zod';

/**
 * [ABE-19] References `MediaAsset` docs rather than storing its own
 * `path`/`type` — the video file and its thumbnail are already uploadable
 * and catalogable via ABE-10's `/api/admin/media/upload-url` +
 * `/api/admin/media` (which already accepts `video/*`), so this schema is
 * the curation layer on top: which uploaded video is shown, where
 * (`placement`), with what caption, against which product, in what order,
 * and whether it's live. `mediaId`/`thumbnailMediaId` are exactly the
 * `resourceId` half of the `MediaAsset.usageRefs` entries
 * `lib/media-usage.ts` was written for but had no caller yet — this is
 * that first caller.
 */
export const VideoPlacementSchema = z.enum(['homepage', 'product_page', 'standalone']);

/**
 * What the clip shows, for the homepage trust reels: how it is made, a
 * customer opening their order, or a customer's own feedback. Defaults to
 * `making` so videos created before this field existed still parse.
 */
export const VideoKindSchema = z.enum(['making', 'unboxing', 'feedback']);

export const VideoSchema = z.object({
  id: z.string(),
  mediaId: z.string(),
  thumbnailMediaId: z.string().nullable(),
  caption: z.string(),
  productId: z.string().nullable(),
  placement: VideoPlacementSchema,
  kind: VideoKindSchema.default('making'),
  isActive: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.date(),
});

export type Video = z.infer<typeof VideoSchema>;
export type VideoKind = z.infer<typeof VideoKindSchema>;
export type VideoPlacement = z.infer<typeof VideoPlacementSchema>;

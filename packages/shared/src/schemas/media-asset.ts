import { z } from 'zod';

/**
 * [ABE-10] A reusable media library — upload once, reference from many
 * places (product media, homepage banners, CMS content). Distinct from
 * the existing `products/{id}/media` subcollection (`ProductMediaSchema`),
 * which is per-product gallery ordering, not a shared asset pool; a
 * future product-media write API can reference a `MediaAsset.id` instead
 * of duplicating an upload, but that migration isn't part of this task.
 *
 * `path` (not `url`) is the durable field, same "only the path survives,
 * the URL is derived" convention BE-03/BE-04 established for customer
 * uploads — except here the derivation is a stable PUBLIC URL
 * (`buildPublicMediaUrl`), never a signed one, since every object here
 * lives under the `public/` Storage prefix (world-readable per
 * storage.rules, admin-SDK-write-only).
 */
export const MediaAssetSchema = z.object({
  id: z.string(),
  path: z.string().min(1).refine((p) => p.startsWith('public/'), 'path must be under the public/ Storage prefix'),
  type: z.enum(['image', 'video']),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  alt: z.string().default(''),
  tags: z.array(z.string()).default([]),
  // [ABE-11] Populated by whatever CRUD route attaches this asset to a
  // resource (e.g. a future product-media write API) — empty here means
  // "not referenced anywhere yet," which is what ABE-11's "warn when in
  // use" check reads.
  usageRefs: z.array(z.object({ resource: z.string(), resourceId: z.string() })).default([]),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type MediaAsset = z.infer<typeof MediaAssetSchema>;
export type MediaUsageRef = MediaAsset['usageRefs'][number];

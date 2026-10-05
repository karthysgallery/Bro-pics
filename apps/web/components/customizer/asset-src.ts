import type { AssetRef } from '@bro-pics/shared';

/** URLs the canvas can read and export: same-origin paths, local blobs and data URLs. */
export function isCanvasSafeUrl(url: string): boolean {
  return url.startsWith('/') || url.startsWith('blob:') || url.startsWith('data:');
}

/**
 * Where the editor loads a template asset (frame, background, mask) from.
 * Media-library assets go through this app's own image route so the canvas is
 * never tainted; a relative URL (files under /public, legacy templates) is used
 * as it is.
 */
export function templateAssetSrc(ref: AssetRef, width = 1600): string | null {
  if (ref.url && isCanvasSafeUrl(ref.url)) return ref.url;
  if (ref.assetId.startsWith('legacy-') || ref.assetId.startsWith('local:')) return ref.url ?? null;
  return `/api/media/${encodeURIComponent(ref.assetId)}/image?w=${width}`;
}

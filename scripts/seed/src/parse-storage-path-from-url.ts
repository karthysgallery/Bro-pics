/**
 * Extracts a Storage object path from a legacy GCS signed URL, so the
 * BE-05a back-fill migration can convert old *Url fields (Upload.
 * originalUrl, Customization.previewUrl/renderedFileUrl, OrderItem.
 * previewUrl, cart-line previewUrl — all pre-2026-09-23) into the
 * *Path fields the app now stores. Every URL this app ever minted came
 * from the same code path (bucket.file(path).getSignedUrl({...}) against
 * storage.googleapis.com), so this only needs to handle that one shape —
 * anything else is a genuine exception the migration should report, not
 * silently coerce.
 *
 * https://storage.googleapis.com/{bucket}/{objectPath}?GoogleAccessId=...&Expires=...&Signature=...
 */
export function parseStoragePathFromUrl(url: string, expectedBucket: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'storage.googleapis.com') return null;

  const prefix = `/${expectedBucket}/`;
  if (!parsed.pathname.startsWith(prefix)) return null;

  const objectPath = decodeURIComponent(parsed.pathname.slice(prefix.length));
  return objectPath.length > 0 ? objectPath : null;
}

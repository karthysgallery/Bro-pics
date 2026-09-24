import 'server-only';

/**
 * [ABE-10] The stable, unsigned public download URL for an object under
 * the `public/` Storage prefix (world-readable per storage.rules — see
 * that file's own comment). Unlike `getSignedReadUrl` (storage-url.ts),
 * this never expires and is never persisted as a shortcut around
 * recomputing it — it's cheap to build and the path is what's durable.
 */
export function buildPublicMediaUrl(path: string): string {
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucket) {
    throw new Error('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set');
  }
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}

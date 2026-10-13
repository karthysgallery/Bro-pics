import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';

/** The picture used when the shop has no sample photos of its own at all. */
export const BUILT_IN_SAMPLE_PHOTO = '/placeholders/home/hero-sample-photo.jpg';

const HOW_MANY = 12;
const KEEP_MS = 5 * 60 * 1000;
let cache: { at: number; urls: string[] } | null = null;

/** Clears the remembered list (tests, and right after sample photos change). */
export function resetDefaultSamplePhotosCache(): void {
  cache = null;
}

/**
 * Example pictures for the empty photo spaces of a photo or collage frame that has none of its own saved: the
 * newest sample photos in the media library (the ones picked or uploaded as "sample photos" in the product editor),
 * so every collage shows examples with no extra work, and falls back to the shop's built-in sample photo.
 * Remembered for 5 minutes so product pages do not each read the library.
 */
export async function getDefaultSamplePhotos(db: Firestore, now = Date.now()): Promise<string[]> {
  if (cache && now - cache.at < KEEP_MS) return cache.urls;
  let urls: string[] = [];
  try {
    const snap = await db.collection('media').where('tags', 'array-contains', 'sample-photo').get();
    urls = snap.docs
      .map((d) => ({ id: d.id, data: d.data() as { type?: string; isActive?: boolean; path?: string; createdAt?: string } }))
      .filter(({ data }) => data.type === 'image' && data.isActive !== false && typeof data.path === 'string' && data.path.startsWith('public/'))
      .sort((a, b) => String(b.data.createdAt ?? '').localeCompare(String(a.data.createdAt ?? '')))
      .slice(0, HOW_MANY)
      .map(({ id }) => `/api/media/${id}/image?w=2000`);
  } catch {
    urls = [];
  }
  const result = urls.length ? urls : [BUILT_IN_SAMPLE_PHOTO];
  cache = { at: now, urls: result };
  return result;
}

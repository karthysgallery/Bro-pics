import 'server-only';

/** Free stock photos from Pexels (https://www.pexels.com/api/): used only as SAMPLE pictures in the shop photos of photo and collage frames. */
export const PEXELS_PHOTO_HOST = 'images.pexels.com';

export interface StockPhoto {
  id: number;
  alt: string;
  /** Small picture for choosing. */
  thumb: string;
  /** The picture to use (large, about 1600 px on the long side). */
  full: string;
  photographer: string;
  photographerUrl: string;
  pageUrl: string;
  width: number;
  height: number;
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt?: string;
  src: { large: string; large2x: string; medium: string; small: string };
}

export class StockPhotosError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

/** The search words, tidied: letters, numbers and spaces only, up to 60. */
export function cleanQuery(q: string | null): string {
  return (q ?? '').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** Only a Pexels picture address (https, their image host) may be fetched on the admin's behalf. */
export function isPexelsPhotoUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname === PEXELS_PHOTO_HOST && u.username === '' && u.password === '' && u.port === '';
  } catch {
    return false;
  }
}

export async function searchStockPhotos(query: string, options: { orientation?: 'portrait' | 'landscape' | 'square'; perPage?: number; page?: number } = {}, fetchImpl: typeof fetch = fetch): Promise<StockPhoto[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new StockPhotosError(503, 'Free stock photos are not switched on yet. Ask your developer to add the PEXELS_API_KEY.');
  const q = cleanQuery(query);
  if (q.length < 2) throw new StockPhotosError(400, 'Type what the photo should show, for example “child” or “couple”.');
  const params = new URLSearchParams({ query: q, per_page: String(Math.min(40, options.perPage ?? 24)), page: String(options.page ?? 1) });
  if (options.orientation) params.set('orientation', options.orientation);
  const res = await fetchImpl(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(10_000) });
  if (res.status === 429) throw new StockPhotosError(429, 'The free photo service is busy. Try again in a minute.');
  if (!res.ok) throw new StockPhotosError(502, 'The free photo service did not answer. Try again in a moment.');
  const body = (await res.json()) as { photos?: PexelsPhoto[] };
  return (body.photos ?? []).map((p) => ({
    id: p.id,
    alt: p.alt || q,
    thumb: p.src.medium,
    full: p.src.large2x || p.src.large,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    pageUrl: p.url,
    width: p.width,
    height: p.height,
  }));
}

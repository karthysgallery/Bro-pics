import 'server-only';

/**
 * Free stock photos for SAMPLE pictures in the shop photos of photo and collage frames. Pixabay
 * (https://pixabay.com/api/docs/, key PIXABAY_API_KEY) or Pexels (PEXELS_API_KEY, new keys are paused at times).
 */
export const PEXELS_PHOTO_HOST = 'images.pexels.com';
export const PIXABAY_PHOTO_HOSTS = ['pixabay.com', 'cdn.pixabay.com'];
export type StockProvider = 'pixabay' | 'pexels';

export interface StockPhoto {
  id: number;
  provider: StockProvider;
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

/** Only a picture address on a stock photo site's own image host (https) may be fetched on the admin's behalf. */
export function isStockPhotoUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const host = u.hostname;
    return u.protocol === 'https:' && (host === PEXELS_PHOTO_HOST || PIXABAY_PHOTO_HOSTS.includes(host)) && u.username === '' && u.password === '' && u.port === '';
  } catch {
    return false;
  }
}
export const isPexelsPhotoUrl = isStockPhotoUrl;

/** Which service is set up (Pixabay first). */
export function stockProvider(): StockProvider | null {
  if (process.env.PIXABAY_API_KEY) return 'pixabay';
  if (process.env.PEXELS_API_KEY) return 'pexels';
  return null;
}

/** Pixabay's tag lists repeat words and run long: the first few different ones make a fair description. */
export function shortTags(tags: string | undefined): string {
  return [...new Set((tags ?? '').split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 4).join(', ');
}

interface PixabayHit {
  id: number;
  pageURL: string;
  tags: string;
  previewURL: string;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
  user_id: number;
}

type SearchOptions = { orientation?: 'portrait' | 'landscape' | 'square'; perPage?: number; page?: number };

export async function searchStockPhotos(query: string, options: SearchOptions = {}, fetchImpl: typeof fetch = fetch): Promise<StockPhoto[]> {
  const provider = stockProvider();
  if (!provider) throw new StockPhotosError(503, 'Free stock photos are not switched on yet. Ask your developer to add the PIXABAY_API_KEY.');
  const q = cleanQuery(query);
  if (q.length < 2) throw new StockPhotosError(400, 'Type what the photo should show, for example “child” or “couple”.');
  return provider === 'pixabay' ? searchPixabay(q, options, fetchImpl) : searchPexels(q, options, fetchImpl);
}

async function searchPixabay(q: string, options: SearchOptions, fetchImpl: typeof fetch): Promise<StockPhoto[]> {
  const params = new URLSearchParams({ key: process.env.PIXABAY_API_KEY!, q, image_type: 'photo', safesearch: 'true', per_page: String(Math.min(40, Math.max(3, options.perPage ?? 24))), page: String(options.page ?? 1) });
  if (options.orientation === 'portrait') params.set('orientation', 'vertical');
  else if (options.orientation === 'landscape') params.set('orientation', 'horizontal');
  const res = await fetchImpl(`https://pixabay.com/api/?${params}`, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 429) throw new StockPhotosError(429, 'The free photo service is busy. Try again in a minute.');
  if (!res.ok) throw new StockPhotosError(502, 'The free photo service did not answer. Try again in a moment.');
  const body = (await res.json()) as { hits?: PixabayHit[] };
  return (body.hits ?? []).map((h) => ({
    id: h.id,
    provider: 'pixabay',
    alt: shortTags(h.tags) || q,
    thumb: h.webformatURL || h.previewURL,
    full: h.largeImageURL || h.webformatURL,
    photographer: h.user,
    photographerUrl: `https://pixabay.com/users/${encodeURIComponent(h.user)}-${h.user_id}/`,
    pageUrl: h.pageURL,
    width: h.imageWidth,
    height: h.imageHeight,
  }));
}

async function searchPexels(q: string, options: SearchOptions, fetchImpl: typeof fetch): Promise<StockPhoto[]> {
  const params = new URLSearchParams({ query: q, per_page: String(Math.min(40, options.perPage ?? 24)), page: String(options.page ?? 1) });
  if (options.orientation) params.set('orientation', options.orientation);
  const res = await fetchImpl(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: process.env.PEXELS_API_KEY! }, signal: AbortSignal.timeout(10_000) });
  if (res.status === 429) throw new StockPhotosError(429, 'The free photo service is busy. Try again in a minute.');
  if (!res.ok) throw new StockPhotosError(502, 'The free photo service did not answer. Try again in a moment.');
  const body = (await res.json()) as { photos?: PexelsPhoto[] };
  return (body.photos ?? []).map((p) => ({
    id: p.id,
    provider: 'pexels',
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

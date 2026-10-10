import 'server-only';
import sharp from 'sharp';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from './firebase-admin';

/**
 * Same-origin image delivery for the personalization canvas. A <canvas> that
 * draws a cross-origin image without CORS headers is "tainted" and can no
 * longer be exported, which would break the room preview and the cart
 * thumbnail. Serving the bytes from this app's own origin avoids depending on
 * Storage CORS configuration, and lets us send a size the editor actually needs.
 */

/** Largest side the editor ever needs. Keeps 40 MB phone photos from reaching the browser at full size. */
export const MAX_PROXY_SIDE = 2400;

export function parseRequestedWidth(raw: string | null, fallback: number): number {
  const n = raw ? Number(raw) : fallback;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MAX_PROXY_SIDE, Math.max(64, Math.round(n)));
}

export interface ProxiedImage {
  body: Buffer;
  contentType: string;
}

/**
 * Widths actually produced. A request is served at the next size up, so a page asking for 900, 1000 and
 * 1100 shares one resized copy (and one cache entry) instead of three.
 */
export const SIZE_STEPS = [160, 320, 480, 640, 800, 1200, 1600, 2000, 2400] as const;
export function sizeStep(width: number): number {
  return SIZE_STEPS.find((s) => s >= width) ?? MAX_PROXY_SIDE;
}

/** A tiny least-recently-used cache bounded by total bytes. */
class ByteLru<V extends { bytes: number }> {
  private map = new Map<string, V>();
  private total = 0;
  constructor(private readonly maxBytes: number) {}
  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: string, value: V) {
    if (value.bytes > this.maxBytes / 4) return; // never let one huge file push everything else out
    const old = this.map.get(key);
    if (old) this.total -= old.bytes;
    this.map.set(key, value);
    this.total += value.bytes;
    while (this.total > this.maxBytes) {
      const [k, v] = this.map.entries().next().value as [string, V];
      this.map.delete(k);
      this.total -= v.bytes;
    }
  }
  clear() {
    this.map.clear();
    this.total = 0;
  }
}

// Resized results (what browsers ask for again and again) and recent originals (so the thumbnail,
// the main view and the zoom of one picture download it from Storage once, not three times).
const resized = new ByteLru<{ bytes: number; image: ProxiedImage }>(96 * 1024 * 1024);
const originals = new ByteLru<{ bytes: number; buffer: Buffer }>(160 * 1024 * 1024);
const inFlight = new Map<string, Promise<ProxiedImage>>();

/** For tests. */
export function clearImageCaches() {
  resized.clear();
  originals.clear();
  inFlight.clear();
}

async function original(path: string): Promise<Buffer> {
  const hit = originals.get(path);
  if (hit) return hit.buffer;
  const [buffer] = await getStorage(getAdminApp()).bucket().file(path).download();
  originals.set(path, { bytes: buffer.length, buffer });
  return buffer;
}

/**
 * Reads a Storage object and returns it resized to at most `maxSide` (rounded up to a standard step)
 * on its longer side. Images with transparency stay transparent (WebP with alpha); opaque ones become
 * JPEG. Results are kept in memory, and simultaneous requests for the same picture share one resize.
 * Storage paths here never change their contents (a new upload gets a new path), so caching is safe.
 */
export async function readStorageImage(path: string, maxSide: number): Promise<ProxiedImage> {
  const side = sizeStep(maxSide);
  const key = `${path}@${side}`;
  const hit = resized.get(key);
  if (hit) return hit.image;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const work = (async () => {
    const image = sharp(await original(path)).rotate();
    const meta = await image.metadata();
    const out = image.resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true });
    const result: ProxiedImage = meta.hasAlpha
      ? { body: await out.webp({ quality: 88, alphaQuality: 100, effort: 2 }).toBuffer(), contentType: 'image/webp' }
      : { body: await out.jpeg({ quality: 84, progressive: true }).toBuffer(), contentType: 'image/jpeg' };
    resized.set(key, { bytes: result.body.length, image: result });
    return result;
  })();
  inFlight.set(key, work);
  try {
    return await work;
  } finally {
    inFlight.delete(key);
  }
}

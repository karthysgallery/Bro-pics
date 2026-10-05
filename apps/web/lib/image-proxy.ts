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
 * Reads a Storage object and returns it resized to at most `maxSide` on its
 * longer side. Images with transparency stay transparent (WebP with alpha);
 * opaque ones become JPEG.
 */
export async function readStorageImage(path: string, maxSide: number): Promise<ProxiedImage> {
  const [buffer] = await getStorage(getAdminApp()).bucket().file(path).download();
  const image = sharp(buffer).rotate();
  const meta = await image.metadata();
  const resized = image.resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true });
  if (meta.hasAlpha) {
    return { body: await resized.webp({ quality: 90, alphaQuality: 100 }).toBuffer(), contentType: 'image/webp' };
  }
  return { body: await resized.jpeg({ quality: 86, mozjpeg: true }).toBuffer(), contentType: 'image/jpeg' };
}

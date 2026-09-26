import 'server-only';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from './firebase-admin';

const DEFAULT_TTL_MINUTES = 15;

/**
 * Mints a short-lived signed read URL for a Storage object path. Callers
 * must never persist the result — only the path is durable; the URL is
 * recomputed on every read (see BE-03/BE-04: storing 1-hour signed URLs as
 * permanent Firestore truth was the original bug — any order/customization
 * older than an hour showed broken images).
 */
export async function getSignedReadUrl(path: string, ttlMinutes: number = DEFAULT_TTL_MINUTES): Promise<string> {
  const bucket = getStorage(getAdminApp()).bucket();
  const [url] = await bucket.file(path).getSignedUrl({
    action: 'read',
    expires: Date.now() + ttlMinutes * 60 * 1000,
  });
  return url;
}

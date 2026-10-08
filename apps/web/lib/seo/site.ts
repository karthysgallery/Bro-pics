/**
 * The ONE public address of the shop, for every canonical link, sitemap entry, structured-data URL and feed link.
 *
 * It is deliberately NOT NEXT_PUBLIC_SITE_URL: that variable is the address a particular deployment is reached
 * at (the Cloud Run preview, localhost, …), and search engines must never be told those are the real pages.
 * Override with SEO_CANONICAL_ORIGIN only if the production domain ever changes.
 */
export const CANONICAL_ORIGIN = (process.env.SEO_CANONICAL_ORIGIN || 'https://karthysgallery.in').replace(/\/+$/, '');

export const SITE_NAME = 'KarthysGallery';

/** Absolute canonical URL for a site path ("/product/x"). Query strings and fragments are never added here. */
export function canonicalUrl(path: string): string {
  const clean = path === '/' || path === '' ? '/' : `/${path.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return `${CANONICAL_ORIGIN}${clean}`;
}

/** Absolute URL for an image/asset reference that may be a site path or already absolute. */
export function absoluteUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${CANONICAL_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** True on the temporary preview deployment, which must never be indexed (see middleware.ts). */
export function isPreviewDeployment(): boolean {
  return process.env.SITE_PREVIEW === '1';
}

/** Hosts a canonical/sitemap URL must never use: previews, Cloud Run, Firebase, localhost. */
export function isForbiddenSeoHost(host: string): boolean {
  return /(^|\.)(run\.app|web\.app|firebaseapp\.com|vercel\.app|localhost)$/i.test(host) || /^(127\.|0\.0\.0\.0|\[::1\])/.test(host) || host.startsWith('localhost');
}

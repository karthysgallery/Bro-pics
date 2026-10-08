import type { MetadataRoute } from 'next';
import { canonicalUrl, isPreviewDeployment } from '../lib/seo/site';

/** Private or useless-to-index areas. Everything else (catalogue, content, images, CSS, JS) stays crawlable. */
export const DISALLOWED_PATHS = [
  '/admin',
  '/staff',
  '/dashboard',
  '/checkout',
  '/cart',
  '/orders',
  '/account',
  '/signin',
  '/signup',
  '/forgot-password',
  '/search',
  // A step in a purchase flow (the personalization editor for one frame of a combo), not a page of its own.
  '/combo/*/frame/',
  '/api/',
];

/** Public images are served through /api/media/…; Google must be able to fetch them even though the rest of /api/ is closed. */
export const ALLOWED_API_PATHS = ['/api/media/'];

export default function robots(): MetadataRoute.Robots {
  // A temporary preview address must never be crawled (see middleware.ts).
  if (isPreviewDeployment()) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: ['/', ...ALLOWED_API_PATHS], disallow: DISALLOWED_PATHS },
    sitemap: canonicalUrl('/sitemap.xml'),
  };
}

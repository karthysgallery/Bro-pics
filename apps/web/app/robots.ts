import type { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://karthysgallery.in';

export default function robots(): MetadataRoute.Robots {
  // A temporary preview address must never be crawled (see middleware.ts).
  if (process.env.SITE_PREVIEW === '1') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // [BE-40] /account was missing — every page under it needs a signed-in
      // user and has nothing for a crawler to index, same reasoning as the
      // other disallowed paths here.
      disallow: ['/admin', '/dashboard', '/staff', '/checkout', '/orders', '/account', '/api'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

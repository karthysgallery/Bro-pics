import type { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bropics.example.com';

export default function robots(): MetadataRoute.Robots {
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

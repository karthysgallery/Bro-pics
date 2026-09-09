import type { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bropics.example.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/dashboard', '/staff', '/checkout', '/orders', '/api'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

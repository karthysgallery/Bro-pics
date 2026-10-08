/** Small, dependency-free builders for the XML sitemap formats (sitemaps.org + Google image extension). */

export interface SitemapImage {
  loc: string;
  title?: string;
  caption?: string;
}

export interface SitemapEntry {
  loc: string;
  lastmod?: Date | string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
  images?: SitemapImage[];
}

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function isoDate(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The hard limits in the sitemap protocol; a file bigger than this must be split. */
export const MAX_SITEMAP_URLS = 50_000;

export function buildUrlset(entries: SitemapEntry[]): string {
  const withImages = entries.some((e) => e.images?.length);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${withImages ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ''}>`,
  ];
  for (const entry of entries.slice(0, MAX_SITEMAP_URLS)) {
    lines.push('  <url>', `    <loc>${escapeXml(entry.loc)}</loc>`);
    const lastmod = entry.lastmod ? isoDate(entry.lastmod) : null;
    if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
    if (entry.changefreq) lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
    if (entry.priority !== undefined) lines.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
    for (const image of entry.images ?? []) {
      lines.push('    <image:image>', `      <image:loc>${escapeXml(image.loc)}</image:loc>`);
      if (image.title) lines.push(`      <image:title>${escapeXml(image.title)}</image:title>`);
      if (image.caption) lines.push(`      <image:caption>${escapeXml(image.caption)}</image:caption>`);
      lines.push('    </image:image>');
    }
    lines.push('  </url>');
  }
  lines.push('</urlset>');
  return lines.join('\n');
}

export function buildSitemapIndex(entries: Array<{ loc: string; lastmod?: Date | string }>): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  for (const entry of entries) {
    lines.push('  <sitemap>', `    <loc>${escapeXml(entry.loc)}</loc>`);
    const lastmod = entry.lastmod ? isoDate(entry.lastmod) : null;
    if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
    lines.push('  </sitemap>');
  }
  lines.push('</sitemapindex>');
  return lines.join('\n');
}

export function xmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Fresh enough for a catalogue that changes through the admin (which also revalidates these routes on edit).
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

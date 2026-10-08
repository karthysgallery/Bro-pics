import type { Metadata } from 'next';
import type { Page } from '@bro-pics/shared';

/**
 * [FE-28] Shared by every `(content)/*\/page.tsx`'s `generateMetadata`:
 * a CMS `Page` doc's own `seo.title`/`seo.description` win when set,
 * otherwise the page's existing hardcoded fallback metadata is used
 * unchanged — matching the same "CMS content overrides hardcoded copy
 * only once an admin actually authors it" rule the page bodies follow.
 *
 * `path` ("/about") gives the page its one canonical address and its Open Graph URL, which every
 * indexable page needs; it resolves against the canonical domain set in the root layout (metadataBase).
 */
export function contentPageMetadata(page: Page | null, fallback: Metadata, path: string): Metadata {
  const title = (page?.seo.title || fallback.title) ?? undefined;
  const description = (page?.seo.description || fallback.description) ?? undefined;
  const plain = (value: unknown) => (typeof value === 'string' ? value : undefined);
  return {
    title: title as Metadata['title'],
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', url: path, ...(plain(title) && { title: plain(title) }), ...(description && { description }) },
  };
}

import type { Metadata } from 'next';
import type { Page } from '@bro-pics/shared';

/**
 * [FE-28] Shared by every `(content)/*\/page.tsx`'s `generateMetadata`:
 * a CMS `Page` doc's own `seo.title`/`seo.description` win when set,
 * otherwise the page's existing hardcoded fallback metadata is used
 * unchanged — matching the same "CMS content overrides hardcoded copy
 * only once an admin actually authors it" rule the page bodies follow.
 */
export function contentPageMetadata(page: Page | null, fallback: Metadata): Metadata {
  if (!page) return fallback;
  return {
    title: page.seo.title || fallback.title,
    description: page.seo.description || fallback.description,
  };
}

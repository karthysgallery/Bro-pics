import 'server-only';
import { revalidatePath } from 'next/cache';
import { logger } from '@bro-pics/shared';

/**
 * [ABE-09] Every storefront page reading catalogue data sets
 * `export const revalidate = 60` (60s ISR) — an admin write shouldn't
 * make a customer wait up to a minute to see it. `revalidatePath` marks
 * the path stale immediately; the next request regenerates it. Best-
 * effort and non-blocking by design: a revalidation failure must never
 * turn an otherwise-successful catalogue write into an error response,
 * same "log, don't fail the request" treatment ABE-03's routes already
 * give `writeAuditLog`.
 */
function safeRevalidate(path: string): void {
  try {
    revalidatePath(path);
  } catch (error) {
    logger.error('Failed to revalidate path', { path, error: String(error) });
  }
}

/** The sitemaps are built from the catalogue: any publish/edit/archive makes them stale at once. */
export function revalidateSitemaps(): void {
  for (const path of ['/sitemap.xml', '/sitemap-products.xml', '/sitemap-categories.xml', '/sitemap-images.xml', '/sitemap-combos.xml', '/feeds/google-merchant.xml']) {
    safeRevalidate(path);
  }
}

export function revalidateHomepage(): void {
  safeRevalidate('/');
}

export function revalidateProductPage(slug: string): void {
  safeRevalidate(`/product/${slug}`);
  revalidateSitemaps();
}

export function revalidateCategoryPage(slug: string): void {
  safeRevalidate(`/category/${slug}`);
  revalidateSitemaps();
}

/** A Combo Offer changed: its own page, the combos list, and the homepage (which can feature combos). */
export function revalidateComboPages(slug: string): void {
  safeRevalidate(`/combo/${slug}`);
  safeRevalidate('/combos');
  safeRevalidate('/');
  revalidateSitemaps();
}

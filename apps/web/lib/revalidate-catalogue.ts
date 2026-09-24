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

export function revalidateHomepage(): void {
  safeRevalidate('/');
}

export function revalidateProductPage(slug: string): void {
  safeRevalidate(`/product/${slug}`);
}

export function revalidateCategoryPage(slug: string): void {
  safeRevalidate(`/category/${slug}`);
}

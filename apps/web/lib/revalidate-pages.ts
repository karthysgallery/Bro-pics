import { revalidatePath } from 'next/cache';

/** Makes a page change (publish, unpublish, approval, withdrawal) show at once instead of after the cache expires. */
export function revalidatePolicyPages(slug?: string): void {
  try {
    if (slug) revalidatePath(`/${slug}`);
    revalidatePath('/', 'layout'); // the footer lists only the pages that are live
  } catch {
    // Outside a Next.js request (tests) there is nothing to revalidate.
  }
}

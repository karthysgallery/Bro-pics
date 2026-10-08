import type { Category } from '@bro-pics/shared';
import { plainText, truncateAtWord } from './product-seo';
import { SITE_NAME } from './site';

const TITLE_LIMIT = 60;

export function categorySeoTitle(category: Pick<Category, 'name' | 'seo'>): string {
  if (category.seo?.title?.trim()) return category.seo.title.trim();
  const branded = `${category.name} | ${SITE_NAME}`;
  return branded.length <= TITLE_LIMIT ? branded : category.name;
}

/**
 * Meta description for a category: the owner's if written, else the category's own description, else a sentence
 * built from its name and how many published products it really has.
 */
export function categorySeoDescription(category: Pick<Category, 'name' | 'seo' | 'description'>, productCount: number): string {
  if (category.seo?.description?.trim()) return category.seo.description.trim();
  const own = plainText(category.description ?? '');
  if (own.length >= 50) return truncateAtWord(own, 160);
  const count = productCount > 0 ? `Browse ${productCount} ${productCount === 1 ? 'design' : 'designs'}` : 'Browse the collection';
  return truncateAtWord(`${category.name} at ${SITE_NAME}. ${count}, add your own photos and preview the result online before you order.`, 160);
}

/**
 * The canonical path for a listing page. Page 1 is the bare category; later pages are their own canonical pages
 * (they list different products). Filters and sorting never change the canonical: they point back at the bare category.
 */
export function categoryCanonicalPath(slug: string, page: number): string {
  return page > 1 ? `/category/${slug}?page=${page}` : `/category/${slug}`;
}

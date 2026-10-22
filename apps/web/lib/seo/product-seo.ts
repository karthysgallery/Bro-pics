import type { Product } from '@bro-pics/shared';
import { canonicalUrl, SITE_NAME } from './site';

/** Plain text from a short rich-text/HTML field: tags removed, entities and whitespace tidied. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cuts text to a limit on a word boundary, adding an ellipsis only when something was cut. */
export function truncateAtWord(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

type SeoProduct = Pick<Product, 'title' | 'slug' | 'shortDesc' | 'photoSlots' | 'allowsTextPersonalization' | 'seo' | 'primaryImageUrl'> & { minPrice?: number };

const TITLE_LIMIT = 60;

/** The shop's old working name, still found in some early products' saved SEO text. */
const OLD_BRAND = /\bBro[\s-]?Pics\b/gi;

/** The owner's saved wording with the old working name replaced by the shop's name. */
function ownWording(text: string | undefined): string {
  return (text ?? '').trim().replace(OLD_BRAND, SITE_NAME);
}
const DESCRIPTION_LIMIT = 160;
const DESCRIPTION_MIN = 70;

/**
 * Page title: the owner's SEO title if they wrote one, otherwise "<product> | KarthysGallery" built from the
 * product's own name. When the branded form would be too long to show in full, the name alone is used.
 */
export function productSeoTitle(product: Pick<Product, 'title' | 'seo'>): string {
  const own = ownWording(product.seo?.title);
  if (own) return own;
  const branded = `${product.title} | ${SITE_NAME}`;
  return branded.length <= TITLE_LIMIT ? branded : product.title;
}

/**
 * Meta description: the owner's if written; otherwise assembled from THIS product's real data — its own short
 * description, how many photos it takes, and its starting price. Because it starts from the product's own text, two
 * products never share a description unless the owner gave them the same short description.
 */
export function productSeoDescription(product: SeoProduct): string {
  const saved = ownWording(product.seo?.description);
  if (saved) return saved;
  const own = plainText(product.shortDesc ?? '');
  const lead = own ? (/[.!?]$/.test(own) ? own : `${own}.`) : `${product.title}.`;
  // Name the product first unless its own text already does (or there is no own text: the lead IS the name).
  const prefix = own && !own.toLowerCase().includes(product.title.toLowerCase()) ? `${product.title}: ` : '';
  const personalise =
    product.photoSlots > 1
      ? `Add your ${product.photoSlots} photos${product.allowsTextPersonalization ? ' and a message' : ''} and preview it online.`
      : `Upload your photo${product.allowsTextPersonalization ? ' and add a message' : ''} and preview it online.`;
  const price = product.minPrice && product.minPrice > 0 ? `From ₹${(product.minPrice / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}.` : '';
  // Richest version that fits; the price is kept ahead of the personalization sentence because it is the more useful fact in a result.
  const candidates = [
    [prefix + lead, personalise, price],
    [prefix + lead, price],
    [prefix + lead, personalise],
    [prefix + lead],
  ].map((parts) => parts.filter(Boolean).join(' '));
  return candidates.find((c) => c.length <= DESCRIPTION_LIMIT) ?? truncateAtWord(candidates[candidates.length - 1]!, DESCRIPTION_LIMIT);
}

export function productCanonicalPath(slug: string): string {
  return `/product/${slug}`;
}

export function productCanonicalUrl(slug: string): string {
  return canonicalUrl(productCanonicalPath(slug));
}

/** Alt text for the product's main image: the owner's, or a plain description from the product's name. */
export function productImageAlt(product: Pick<Product, 'title' | 'seo'>): string {
  return ownWording(product.seo?.imageAlt) || `${product.title} — personalized photo frame`;
}

export interface SeoCheck {
  id: string;
  label: string;
  ok: boolean;
  /** Counts toward the score. Informational checks (like a custom title) are not required. */
  required: boolean;
  hint?: string;
}

/** What the admin sees for a product: what search engines will get, and how complete the product's SEO inputs are. */
export function productSeoReport(product: SeoProduct & { isActive?: boolean }) {
  const title = productSeoTitle(product);
  const description = productSeoDescription(product);
  const own = plainText(product.shortDesc ?? '');
  const checks: SeoCheck[] = [
    { id: 'title-length', label: 'Page title fits in search results (≤ 60 characters)', ok: title.length <= 65, required: true, hint: 'Shorten the product name or write an SEO title.' },
    { id: 'description-length', label: `Meta description is ${DESCRIPTION_MIN}–${DESCRIPTION_LIMIT} characters`, ok: description.length >= DESCRIPTION_MIN && description.length <= DESCRIPTION_LIMIT + 1, required: true, hint: 'Write a longer short description, or an SEO description.' },
    { id: 'short-desc', label: 'Short description written (40+ characters)', ok: own.length >= 40, required: true, hint: 'The short description feeds the automatic meta description.' },
    { id: 'main-image', label: 'Main product image set', ok: Boolean(product.primaryImageUrl), required: true, hint: 'Add a photo in the product media.' },
    { id: 'image-alt', label: 'Image description (alt text) written', ok: Boolean(product.seo?.imageAlt?.trim()), required: false, hint: 'Optional: a default is generated from the product name.' },
    { id: 'focus-keyword', label: 'Search phrase chosen', ok: Boolean(product.seo?.focusKeyword?.trim()), required: false, hint: 'Optional: the phrase this page should answer.' },
    { id: 'custom-title', label: 'Custom SEO title', ok: Boolean(product.seo?.title?.trim()), required: false, hint: 'Optional: the automatic title is used otherwise.' },
  ];
  const required = checks.filter((c) => c.required);
  const optional = checks.filter((c) => !c.required);
  const score = Math.round(
    (required.filter((c) => c.ok).length / required.length) * 80 + (optional.filter((c) => c.ok).length / optional.length) * 20
  );
  const indexable = product.isActive !== false && !product.seo?.noindex;
  return {
    title,
    description,
    canonicalUrl: productCanonicalUrl(product.slug),
    indexable,
    inSitemap: indexable,
    score,
    checks,
  };
}

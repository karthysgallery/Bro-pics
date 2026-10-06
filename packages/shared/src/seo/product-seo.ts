/**
 * A product page's SEO check: what a search engine sees for this product, and
 * plain-language fixes. The score is a guide to good on-page SEO; ranking also
 * depends on things no page can control (competition, reviews, links).
 */

export interface ProductSeoInput {
  title: string;
  slug: string;
  shortDesc: string;
  descriptionHtml: string;
  seoTitle?: string;
  seoDescription?: string;
  focusKeyword?: string;
  keywords?: readonly string[];
  imageAlt?: string;
  hasImage: boolean;
}

export interface SeoCheck {
  id: string;
  ok: boolean;
  /** How much the check counts toward the score. */
  weight: number;
  label: string;
  /** What to do when the check fails. */
  fix: string;
}

export interface ProductSeoReport {
  score: number;
  grade: 'good' | 'fair' | 'poor';
  checks: SeoCheck[];
  /** What Google is likely to show. */
  preview: { title: string; description: string; url: string };
}

export const SEO_SITE_NAME = 'KarthysGallery';

const plainText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9஀-௿ऀ-ॿ]+/g, ' ').trim();

/** Every word of the phrase appears (any order), so "vijay frame" matches "Frame of Vijay". */
export function containsPhrase(haystack: string, phrase: string): boolean {
  const h = ` ${norm(haystack)} `;
  const words = norm(phrase).split(' ').filter(Boolean);
  return words.length > 0 && words.every((w) => h.includes(` ${w} `) || h.includes(` ${w}s `));
}

/** A URL slug from any phrase: "Thalapathy Vijay Photo Frame!" → "thalapathy-vijay-photo-frame". */
export function slugify(phrase: string): string {
  return phrase
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** The title Google shows: the SEO title, or "<product> | KarthysGallery". */
export function effectiveSeoTitle(input: Pick<ProductSeoInput, 'title' | 'seoTitle'>): string {
  return input.seoTitle?.trim() || `${input.title} | ${SEO_SITE_NAME}`;
}

export function effectiveSeoDescription(input: Pick<ProductSeoInput, 'shortDesc' | 'seoDescription'>): string {
  return input.seoDescription?.trim() || input.shortDesc.trim();
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Ready-made wording an admin can start from, built around the focus keyword. */
export function suggestSeo(input: Pick<ProductSeoInput, 'title' | 'shortDesc' | 'focusKeyword'>): {
  seoTitle: string;
  seoDescription: string;
  slug: string;
  imageAlt: string;
} {
  const kw = input.focusKeyword?.trim() || input.title;
  const named = containsPhrase(input.title, kw);
  const seoTitle = (named ? `${input.title} | ${SEO_SITE_NAME}` : `${titleCase(kw)} – ${input.title} | ${SEO_SITE_NAME}`).slice(0, 65);
  const seoDescription = `Buy ${kw} online at ${SEO_SITE_NAME}. ${input.shortDesc.trim()} Personalised with your photo, handcrafted in India and delivered to your door.`
    .replace(/\s+/g, ' ')
    .slice(0, 158)
    .trim();
  return {
    seoTitle,
    seoDescription,
    slug: slugify(named ? input.title : `${kw} ${input.title}`),
    imageAlt: named ? input.title : `${titleCase(kw)} – ${input.title}`,
  };
}

export function analyseProductSeo(input: ProductSeoInput, siteUrl = 'https://karthysgallery.in'): ProductSeoReport {
  const title = effectiveSeoTitle(input);
  const description = effectiveSeoDescription(input);
  const body = plainText(input.descriptionHtml);
  const kw = input.focusKeyword?.trim() ?? '';
  const words = body ? body.split(' ').length : 0;
  const has = (s: string) => kw !== '' && containsPhrase(s, kw);

  const checks: SeoCheck[] = [
    { id: 'focus', ok: kw.length >= 3, weight: 15, label: 'A focus keyword is set', fix: 'Add the phrase customers type into Google, e.g. "vijay photo frame".' },
    { id: 'title-kw', ok: has(title), weight: 15, label: 'The focus keyword is in the search title', fix: 'Put the focus keyword near the start of the SEO title.' },
    {
      id: 'title-len',
      ok: title.length >= 30 && title.length <= 65,
      weight: 8,
      label: `Search title length (${title.length} characters, best 30–65)`,
      fix: title.length < 30 ? 'Make the SEO title longer (30–65 characters).' : 'Shorten the SEO title to 65 characters or less, or Google cuts it off.',
    },
    { id: 'desc-kw', ok: has(description), weight: 10, label: 'The focus keyword is in the search description', fix: 'Use the focus keyword once in the meta description.' },
    {
      id: 'desc-len',
      ok: description.length >= 110 && description.length <= 160,
      weight: 8,
      label: `Search description length (${description.length} characters, best 110–160)`,
      fix: description.length < 110 ? 'Write a fuller meta description (110–160 characters) that sells the product.' : 'Shorten the meta description to 160 characters or less.',
    },
    { id: 'slug-kw', ok: has(input.slug.replace(/-/g, ' ')), weight: 10, label: 'The focus keyword is in the page address', fix: 'Change the URL slug to include the keyword, e.g. /product/vijay-photo-frame.' },
    { id: 'name-kw', ok: has(input.title), weight: 8, label: 'The product name contains the focus keyword', fix: 'Use the words people search for in the product name itself.' },
    { id: 'body', ok: words >= 120, weight: 8, label: `Detailed product description (${words} words, best 120+)`, fix: 'Write at least 120 words: what it is, sizes, materials, who it is for, gifting occasions.' },
    { id: 'body-kw', ok: has(body), weight: 6, label: 'The focus keyword is in the product description', fix: 'Mention the focus keyword naturally in the description.' },
    {
      id: 'alt',
      ok: Boolean(input.imageAlt?.trim()) && (kw === '' || has(input.imageAlt ?? '')),
      weight: 6,
      label: 'The main photo has alt text with the keyword',
      fix: 'Describe the main photo in the image alt text, including the focus keyword.',
    },
    { id: 'image', ok: input.hasImage, weight: 3, label: 'The product has a photo', fix: 'Add product photos: they show in Google Images and shopping results.' },
    {
      id: 'keywords',
      ok: (input.keywords?.filter((k) => k.trim()).length ?? 0) >= 3,
      weight: 3,
      label: 'Related search phrases are listed',
      fix: 'Add at least 3 other phrases people use, e.g. "thalapathy vijay frame", "vijay fan gift".',
    },
  ];
  const total = checks.reduce((n, c) => n + c.weight, 0);
  const score = Math.round((checks.filter((c) => c.ok).reduce((n, c) => n + c.weight, 0) / total) * 100);
  return {
    score,
    grade: score >= 80 ? 'good' : score >= 50 ? 'fair' : 'poor',
    checks,
    preview: {
      title: title.length > 65 ? `${title.slice(0, 62)}…` : title,
      description: description.length > 160 ? `${description.slice(0, 157)}…` : description,
      url: `${siteUrl.replace(/\/$/, '')}/product/${input.slug}`,
    },
  };
}

import { landingPageBySlug, productMatchesLanding } from './seo/landing-pages';
import { getIndexableProducts } from './seo/sitemap-data';

/** One slide of the home page's "Shop by category" row. */
export interface CategorySlide {
  title: string;
  tagline: string;
  href: string;
  image: string;
}

/** The owner's eight categories, in order. Each opens an existing shop page. */
const SLIDES: Array<{ title: string; tagline: string; landing?: string; href?: string; fallback: string }> = [
  { title: 'Photo to Frames', tagline: 'Your photo, beautifully framed', landing: 'personalised-photo-frames', fallback: '/placeholders/categories/frames.jpg' },
  { title: 'Collage Frames', tagline: 'Many memories, one frame', landing: 'photo-collage-frames', fallback: '/placeholders/categories/collage.jpg' },
  { title: 'Wall Décor & Combos', tagline: 'Make your walls vibrant', href: '/category/frames-wall-decor', fallback: '/placeholders/categories/frames.jpg' },
  { title: 'Celebrity Frames', tagline: 'Your favourite stars', landing: 'celebrity-photo-frames', fallback: '/placeholders/categories/frames.jpg' },
  { title: 'God Frames', tagline: 'For your pooja room', landing: 'god-photo-frames', fallback: '/placeholders/categories/canvas.jpg' },
  { title: 'Birthday Frames', tagline: 'Make their day special', landing: 'birthday-photo-frames', fallback: '/placeholders/categories/gifts.jpg' },
  { title: 'Anniversary Frames', tagline: 'Celebrate your love', landing: 'wedding-anniversary-photo-frames', fallback: '/placeholders/categories/collage.jpg' },
  { title: 'Baby Frames', tagline: 'Their first moments', landing: 'baby-photo-frames', fallback: '/placeholders/categories/gifts.jpg' },
];

/**
 * The slides with a real picture each: the styled shop photo of the first product on that page (so new products
 * show up by themselves), else a placeholder. Each product is used once, so the row shows eight different frames.
 */
export async function getCategorySlides(): Promise<CategorySlide[]> {
  const products = await getIndexableProducts().catch(() => []);
  const used = new Set<string>();
  return SLIDES.map((s) => {
    const page = s.landing ? landingPageBySlug(s.landing) : undefined;
    const href = page ? `/photo-frames/${page.slug}` : (s.href ?? '/category');
    const candidates = page && !page.match.all ? products.filter((p) => productMatchesLanding(page, p)) : products;
    const pick = candidates.find((p) => !used.has(p.id) && (p.listingImageUrl || p.primaryImageUrl));
    if (pick) used.add(pick.id);
    return { title: s.title, tagline: s.tagline, href, image: pick?.listingImageUrl || pick?.primaryImageUrl || s.fallback };
  });
}

import Link from 'next/link';
import Image from 'next/image';
import type { Category } from '@bro-pics/shared';
import { Section } from '../ui/Section';
import { SectionHeader } from '../ui/SectionHeader';

interface CategoryTilesProps {
  title: string;
  categories: Category[];
}

const TAGLINES: Record<string, string> = {
  'frames-wall-decor': 'Make your walls vibrant',
  'canvas-prints': 'Art that speaks',
  'collage-combo-sets': 'More memories together',
  'personalized-gifts': 'Thoughtful & unique',
};

const FALLBACK_IMAGES: Record<string, string> = {
  'frames-wall-decor': '/placeholders/categories/frames.jpg',
  'canvas-prints': '/placeholders/categories/canvas.jpg',
  'collage-combo-sets': '/placeholders/categories/collage.jpg',
  'personalized-gifts': '/placeholders/categories/gifts.jpg',
};

/**
 * Category tiles as gallery pictures: a large image (4:5) with the name on a band under a fine gold rule.
 * Two across on phones, four on desktop.
 */
export function CategoryTiles({ title, categories }: CategoryTilesProps) {
  if (categories.length === 0) return null;

  return (
    <Section>
      <SectionHeader title={title} subtitle="Find the perfect piece for every moment" href="/category" />
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {categories.map((category) => {
          const imgSrc =
            category.image ||
            FALLBACK_IMAGES[category.slug] ||
            '/placeholders/products/classic-wooden-photo-frame-1.svg';
          const tagline = TAGLINES[category.slug] || 'Explore collection';

          return (
            <li key={category.id}>
              <Link
                href={`/category/${category.slug}`}
                className="group block overflow-hidden rounded-card bg-paper ring-1 ring-line/70 transition-shadow duration-300 hover:shadow-[0_16px_36px_-16px_rgb(78_57_32/0.4)]"
              >
                {/* Large picture, as in a gallery: the frames are the point. */}
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-tint">
                  <Image
                    src={imgSrc}
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                  />
                </div>
                {/* Name band under a fine gold rule. */}
                <div className="border-t border-gold/60 px-3 py-3 text-center sm:px-4 sm:py-4">
                  <span className="block line-clamp-2 font-display text-[16px] font-semibold leading-[1.15] text-ink transition-colors group-hover:text-accent sm:text-[20px]">
                    {category.name}
                  </span>
                  <span className="mt-1 block truncate text-[11px] uppercase tracking-[0.14em] text-ink/55">{tagline}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export default CategoryTiles;

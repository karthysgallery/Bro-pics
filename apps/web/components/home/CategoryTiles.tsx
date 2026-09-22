import Link from 'next/link';
import Image from 'next/image';
import type { Category } from '@bro-pics/shared';
import { Section } from '../ui/Section';
import { SectionHeader } from '../ui/SectionHeader';

interface CategoryTilesProps {
  title: string;
  categories: Category[];
}

/** A short promise per collection, so the row says something a bare name
 *  cannot. Keyed by slug and skipped silently for anything unlisted. */
const TAGLINES: Record<string, string> = {
  'frames-wall-decor': 'Make your walls vibrant',
  'canvas-prints': 'Art that speaks',
  'collage-combo-sets': 'More memories together',
  'personalized-gifts': 'Thoughtful & unique',
};

/**
 * Pill cards rather than bare circles: a thumbnail on the left, the name and
 * its promise on the right. The extra line is what turns a row of icons into
 * a row of reasons to click.
 */
export function CategoryTiles({ title, categories }: CategoryTilesProps) {
  if (categories.length === 0) return null;

  return (
    <Section>
      <SectionHeader title={title} subtitle="Find the perfect piece for every moment" href="/category" />
      {/* pr-20 on mobile keeps a full-width tile clear of LayoutChrome's fixed
          bottom-right WhatsApp button (bottom-6 right-6, ~48px), which
          otherwise lands on top of a stacked single-column tile at common
          scroll positions and blocks taps on it — same recurring class of
          overlap as VariantSelector/BuyBox/Footer, see VariantSelector's
          comment for the fuller explanation. */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pr-20 sm:pr-0">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href={`/category/${category.slug}`}
              className="group flex items-center gap-3 rounded-2xl bg-paper border border-line p-2.5 hover:border-gold transition-colors"
            >
              <span className="relative w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-tint">
                {category.image ? (
                  <Image src={category.image} alt="" fill sizes="56px" className="object-cover" />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink truncate group-hover:text-accent transition-colors">
                  {category.name}
                </span>
                {TAGLINES[category.slug] && (
                  <span className="block text-2xs text-ink/55 truncate">{TAGLINES[category.slug]}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

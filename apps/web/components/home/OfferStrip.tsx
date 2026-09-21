import Link from 'next/link';
import Image from 'next/image';
import type { HomepageSection } from '@bro-pics/shared';

interface OfferStripProps {
  section: HomepageSection;
}

/**
 * The reference's promo band: one wide image that breaks up the catalogue
 * rows. `offer_strip` has been in HomepageSectionTypeSchema (and seeded) all
 * along without ever being drawn — this renders it, so admins get the band by
 * activating a document rather than by a code change.
 */
export function OfferStrip({ section }: OfferStripProps) {
  const body = (
    <div className="relative rounded-3xl overflow-hidden bg-tint h-[140px] sm:h-[180px] md:h-[220px]">
      {section.image ? (
        <Image
          src={section.image}
          alt={section.image ? section.title : ''}
          fill
          sizes="(max-width: 1280px) 100vw, 1280px"
          className="object-cover"
        />
      ) : null}
      {(section.title || section.subtitle) && (
        <div className="absolute inset-0 flex flex-col justify-center gap-1 bg-gradient-to-r from-ink/65 to-transparent px-5 md:px-10">
          <p className="text-paper text-lg md:text-2xl font-semibold max-w-md">{section.title}</p>
          {section.subtitle && <p className="text-paper/85 text-sm max-w-md">{section.subtitle}</p>}
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-3">
      {section.link ? <Link href={section.link}>{body}</Link> : body}
    </div>
  );
}

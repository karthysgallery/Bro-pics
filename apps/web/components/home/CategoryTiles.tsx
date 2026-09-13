import Link from 'next/link';
import Image from 'next/image';
import type { Category } from '@bro-pics/shared';

export function CategoryTiles({ title, categories }: { title: string; categories: Category[] }) {
  return (
    <section className="px-4 py-10 md:px-8">
      <h2 className="font-display text-2xl text-center mb-6">{title}</h2>
      {/* pr-20 on mobile keeps a wrapped tile clear of the fixed WhatsApp
          button (LayoutChrome renders it bottom-6 right-6 at w-14 h-14),
          which otherwise can land on top of a tile at common scroll
          positions and block taps on it -- same fix as VariantSelector's,
          see that component's comment for the full explanation. */}
      <div className="flex flex-wrap justify-center gap-6 pr-20 sm:pr-0">
        {categories.map((category) => (
          <Link key={category.id} href={`/category/${category.slug}`} className="flex flex-col items-center gap-2">
            <div className="relative w-24 h-24">
              <Image src={category.image} alt={category.name} fill sizes="96px" className="rounded-full object-cover" />
            </div>
            <span className="text-sm">{category.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

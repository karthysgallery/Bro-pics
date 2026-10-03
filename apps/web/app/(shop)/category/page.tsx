import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getActiveCategories } from '../../../lib/firestore-categories';
import { Section } from '../../../components/ui/Section';

export const metadata: Metadata = {
  title: 'Shop all photo frame collections — BroPics',
  description:
    'Browse every BroPics collection of personalized photo frames — pick a size and orientation, upload your photo, and preview it before you buy.',
};

export default async function CategoryIndexPage() {
  const categories = await getActiveCategories();
  const topLevel = categories.filter((category) => !category.parentId);

  return (
    <Section>
      <div className="flex flex-col gap-8">
        {/* Breadcrumb & Header */}
        <div>
          <nav className="flex items-center gap-2 text-xs text-ink/60 mb-3" aria-label="Breadcrumbs">
            <Link href="/" className="hover:text-ink transition-colors">
              Home
            </Link>
            <span>/</span>
            <span className="text-ink font-medium">Categories</span>
          </nav>

          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/60">
            ALL COLLECTIONS
          </p>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-ink">
            Find the frame that fits your space.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-ink/75 leading-relaxed">
            Every BroPics frame is personalized and made to order — pick a collection below, choose
            your size, and upload the photo you want printed. You will see exactly how it looks
            inside the frame before you pay for it.
          </p>
          <p className="mt-2 text-xs font-semibold text-ink/60">{topLevel.length} collections available</p>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {topLevel.map((category) => {
            const children = categories.filter((child) => child.parentId === category.id);
            return (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="group flex flex-col rounded-3xl bg-paper border border-line overflow-hidden hover:shadow-md hover:border-line/80 transition-all"
              >
                <div className="relative aspect-[4/3] bg-tint overflow-hidden">
                  {category.image ? (
                    <Image
                      src={category.image}
                      alt={category.name}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 25vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : null}
                </div>
                <div className="p-5 flex flex-col justify-between flex-1">
                  <div>
                    <h2 className="font-display text-lg font-bold text-ink group-hover:text-gold transition-colors">
                      {category.name}
                    </h2>
                    <p className="mt-1 text-xs text-ink/65 line-clamp-2">
                      Handcrafted with archival prints & real wood finishes.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-line/40 flex items-center justify-between text-xs font-semibold text-ink">
                    <span>Explore frames</span>
                    <span className="text-gold group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </Section>
  );
}


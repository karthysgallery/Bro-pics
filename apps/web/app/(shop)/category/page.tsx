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
      <h1 className="text-2xl font-semibold text-ink">Shop all</h1>
      {/* [FE-29] SEO copy for the index page itself, distinct from each
          category's own seo.title/description (used on /category/[slug])
          and Category.description (that page's own body copy, from
          ABE-05) — this page lists every collection, so its intro speaks
          to the whole catalogue rather than any one of them. */}
      <p className="mt-1 max-w-2xl text-sm text-ink/70">
        Every BroPics frame is personalized and made to order — pick a collection below, choose
        your size, and upload the photo you want printed. You will see exactly how it looks
        inside the frame before you pay for it.
      </p>
      <p className="mt-3 mb-6 text-sm text-ink/60">{topLevel.length} collections</p>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-6">
        {topLevel.map((category) => {
          const children = categories.filter((child) => child.parentId === category.id);
          return (
            <Link key={category.id} href={`/category/${category.slug}`} className="group">
              <div className="relative aspect-square rounded-2xl bg-tint overflow-hidden">
                {category.image ? (
                  <Image
                    src={category.image}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 50vw, 20vw"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <p className="mt-2 text-sm font-medium text-ink group-hover:text-accent transition-colors">
                {category.name}
              </p>
              {children.length > 0 ? (
                <p className="text-2xs text-ink/50">{children.length} sub-collections</p>
              ) : null}
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getActiveCategories } from '../../../lib/firestore-categories';
import { Section } from '../../../components/ui/Section';

export const metadata: Metadata = {
  title: 'Shop all categories — BroPics',
  description: 'Browse every BroPics collection: photo frames, canvas prints, collages and gifts.',
};

export default async function CategoryIndexPage() {
  const categories = await getActiveCategories();
  const topLevel = categories.filter((category) => !category.parentId);

  return (
    <Section>
      <h1 className="text-2xl font-semibold text-ink">Shop all</h1>
      <p className="mt-1 mb-6 text-sm text-ink/60">{topLevel.length} collections</p>

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

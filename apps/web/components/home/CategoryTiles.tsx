import Link from 'next/link';
import type { Category } from '@bro-pics/shared';

export function CategoryTiles({ title, categories }: { title: string; categories: Category[] }) {
  return (
    <section className="px-4 py-10 md:px-8">
      <h2 className="font-display text-2xl text-center mb-6">{title}</h2>
      <div className="flex flex-wrap justify-center gap-6">
        {categories.map((category) => (
          <Link key={category.id} href={`/category/${category.slug}`} className="flex flex-col items-center gap-2">
            <img src={category.image} alt={category.name} className="w-24 h-24 rounded-full object-cover" />
            <span className="text-sm">{category.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

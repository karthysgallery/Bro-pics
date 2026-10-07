import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getPublishedComboBySlug, getPublishedCombos } from '../../../../lib/firestore-combos';
import { getComboItemCards } from '../../../../lib/firestore-combo-detail';
import { ComboBuilder } from '../../../../components/combo/ComboBuilder';

export const revalidate = 60;

interface ComboPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const combos = await getPublishedCombos().catch(() => []);
  return combos.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: ComboPageProps): Promise<Metadata> {
  const { slug } = await params;
  const combo = await getPublishedComboBySlug(slug);
  if (!combo) return { title: 'Combo not found | KarthysGallery' };
  const description = combo.description.slice(0, 160) || `${combo.name}: a set of personalized frames at one price.`;
  const images = combo.coverImageUrl ? [{ url: combo.coverImageUrl, alt: combo.coverImageAlt || combo.name }] : undefined;
  return {
    title: `${combo.name} | KarthysGallery`,
    description,
    alternates: { canonical: `/combo/${combo.slug}` },
    openGraph: { type: 'website', siteName: 'KarthysGallery', url: `/combo/${combo.slug}`, title: combo.name, description, ...(images && { images }) },
  };
}

export default async function ComboPage({ params }: ComboPageProps) {
  const { slug } = await params;
  const combo = await getPublishedComboBySlug(slug);
  if (!combo) notFound();
  const cards = await getComboItemCards(combo);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: combo.name,
    description: combo.description,
    ...(combo.coverImageUrl && { image: combo.coverImageUrl }),
    offers: { '@type': 'Offer', priceCurrency: 'INR', price: (combo.price / 100).toFixed(2), availability: 'https://schema.org/InStock' },
  };

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 font-sans text-xs text-ink/60">
        <Link href="/" className="transition-colors hover:text-ink">Home</Link>
        <span className="text-ink/40">/</span>
        <Link href="/combos" className="transition-colors hover:text-ink">Combo offers</Link>
        <span className="text-ink/40">/</span>
        <span>{combo.name}</span>
      </nav>
      <ComboBuilder combo={combo} cards={cards} />
    </div>
  );
}

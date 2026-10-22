import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Product } from '@bro-pics/shared';
import { Section } from '../../../../components/ui/Section';
import { ProductCard } from '../../../../components/product/ProductCard';
import { buildBreadcrumbList } from '../../../../lib/structured-data';
import { canonicalUrl, absoluteUrl } from '../../../../lib/seo/site';
import { getIndexableProducts } from '../../../../lib/seo/sitemap-data';
import { serializeDoc } from '../../../../lib/serialize-doc';
import { LANDING_PAGES, landingPageBySlug, productMatchesLanding } from '../../../../lib/seo/landing-pages';

export const revalidate = 300;

export function generateStaticParams() {
  return LANDING_PAGES.map((p) => ({ slug: p.slug }));
}

interface Props {
  params: Promise<{ slug: string }>;
}

async function productsFor(slug: string): Promise<Product[]> {
  const page = landingPageBySlug(slug);
  if (!page) return [];
  const all = await getIndexableProducts().catch(() => []);
  return all
    .filter((p) => productMatchesLanding(page, p))
    .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0) || a.title.localeCompare(b.title))
    .slice(0, 48)
    .map((p) => serializeDoc(p) as Product);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = landingPageBySlug(slug);
  if (!page) notFound();
  const products = await productsFor(slug);
  const image = products.find((p) => p.primaryImageUrl)?.primaryImageUrl;
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: `/photo-frames/${page.slug}` },
    // A page with no product to show yet stays out of Google until it has some.
    ...(products.length === 0 && { robots: { index: false, follow: true } }),
    openGraph: {
      type: 'website',
      url: `/photo-frames/${page.slug}`,
      title: page.title,
      description: page.description,
      ...(image && { images: [{ url: absoluteUrl(image) }] }),
    },
  };
}

export default async function LandingPage({ params }: Props) {
  const { slug } = await params;
  const page = landingPageBySlug(slug);
  if (!page) notFound();
  const products = await productsFor(slug);
  const related = page.related.map((r) => landingPageBySlug(r)).filter((r): r is NonNullable<typeof r> => Boolean(r));

  const jsonLd = [
    buildBreadcrumbList([
      { name: 'Home', path: '/' },
      { name: 'Photo frames', path: '/photo-frames' },
      { name: page.h1, path: `/photo-frames/${page.slug}` },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: page.h1,
      description: page.description,
      url: canonicalUrl(`/photo-frames/${page.slug}`),
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: products.length,
        itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: canonicalUrl(`/product/${p.slug}`), name: p.title })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Section space="tight">
        <nav className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink/60" aria-label="Breadcrumbs">
          <Link href="/" className="hover:text-ink">Home</Link>
          <span>/</span>
          <Link href="/photo-frames" className="hover:text-ink">Photo frames</Link>
          <span>/</span>
          <span className="font-medium text-ink">{page.h1}</span>
        </nav>
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">{page.h1}</h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-ink/75">{page.lead}</p>
      </Section>

      <Section space="tight">
        {products.length > 0 ? (
          <>
            <p className="mb-4 text-sm font-semibold text-ink/60">{products.length} designs</p>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-ink/70">
            New designs are on their way. <Link href="/category" className="font-semibold underline">See all our frames</Link>.
          </p>
        )}
      </Section>

      <Section tone="paper">
        <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
          <article className="max-w-3xl space-y-8">
            {page.sections.map((s) => (
              <section key={s.heading}>
                <h2 className="font-display text-xl font-bold text-ink">{s.heading}</h2>
                {s.paragraphs.map((para, i) => (
                  <p key={i} className="mt-3 leading-relaxed text-ink/75">
                    {para}
                  </p>
                ))}
              </section>
            ))}
            <section>
              <h2 className="font-display text-xl font-bold text-ink">Questions customers ask</h2>
              <dl className="mt-3 space-y-4">
                {page.faq.map((f) => (
                  <div key={f.q}>
                    <dt className="font-semibold text-ink">{f.q}</dt>
                    <dd className="mt-1 leading-relaxed text-ink/75">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </article>
          {related.length > 0 && (
            <aside aria-label="More photo frames">
              <h2 className="text-sm font-bold text-ink">You may also like</h2>
              <ul className="mt-3 space-y-2">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/photo-frames/${r.slug}`} className="text-sm font-semibold text-ink underline-offset-4 hover:underline">
                      {r.h1}
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </Section>
    </>
  );
}

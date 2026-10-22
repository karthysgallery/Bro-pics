import type { Metadata } from 'next';
import Link from 'next/link';
import { Section } from '../../../components/ui/Section';
import { buildBreadcrumbList } from '../../../lib/structured-data';
import { LANDING_PAGES } from '../../../lib/seo/landing-pages';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: 'Photo Frames Online for Every Occasion | KarthysGallery' },
  description: 'Personalised photo frames, photo collages, birthday, wedding, baby, couple, family and calendar frames, delivered across India. Free delivery in Tamil Nadu.',
  alternates: { canonical: '/photo-frames' },
  openGraph: { type: 'website', url: '/photo-frames', title: 'Photo Frames Online | KarthysGallery' },
};

export default function PhotoFramesIndexPage() {
  const breadcrumb = buildBreadcrumbList([
    { name: 'Home', path: '/' },
    { name: 'Photo frames', path: '/photo-frames' },
  ]);
  return (
    <Section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">Photo frames for every moment</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-ink/75">
        Every frame is personalised with your own photos and made to order. Choose what you are celebrating, preview the finished frame on screen, and we
        deliver it anywhere in India — free within Tamil Nadu.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LANDING_PAGES.map((p) => (
          <li key={p.slug}>
            <Link href={`/photo-frames/${p.slug}`} className="block h-full rounded-2xl border border-line bg-paper p-5 hover:border-ink/40">
              <h2 className="font-display text-lg font-bold text-ink">{p.h1}</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink/70">{p.lead}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

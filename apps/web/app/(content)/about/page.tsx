import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '../../../components/content/PageIntro';
import { getPageBySlug } from '../../../lib/firestore-content';
import { contentPageMetadata } from '../../../lib/content-page-metadata';

const FALLBACK_METADATA: Metadata = {
  title: 'About us — BroPics',
  description: 'Who we are, how BroPics frames are made, and what we promise about the print on your wall.',
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug('about').catch(() => null);
  return contentPageMetadata(page, FALLBACK_METADATA);
}

export default async function AboutPage() {
  const page = await getPageBySlug('about').catch(() => null);
  if (page) {
    return (
      <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
        <PageIntro title={page.title} />
        <div dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-4">
        <Link href="/" className="hover:text-ink">Home</Link>
        {' / '}
        <span className="text-ink font-medium">About BroPics</span>
      </nav>

      <div className="mb-10">
        <h1 className="font-display text-3xl md:text-5xl font-bold text-ink mb-3 leading-tight">
          Good memories shouldn&apos;t stay on a phone.
        </h1>
        <p className="text-sm md:text-base text-ink/70">
          We&apos;re BroPics. We make a beautiful home for the photographs that mean something to you.
        </p>
      </div>

      {/* Hero Story Split */}
      <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center my-12">
        <div className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-tint shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=1000&auto=format&fit=crop&q=80"
            alt="Artisan assembling frame by hand"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="space-y-4 text-sm text-ink/80 leading-relaxed">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-ink mb-2">
            Personal by nature. Crafted by hand.
          </h2>
          <p>
            A family holiday. A wedding afternoon. A wonderfully ordinary day. We started BroPics to make those moments part of everyday life, not just another scroll through the camera roll.
          </p>
          <p>
            Our frames are made and finished in India. We pair honest materials with archival printing, then check every photo and every corner before it leaves our workshop.
          </p>
          <p className="font-bold text-ink pt-2">
            Less clutter. More meaning. That&apos;s our kind of home.
          </p>
        </div>
      </div>

      {/* 4-item Trust Bar */}
      <div className="my-16 py-6 border-y border-line grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 text-ink/80 text-xs md:text-sm font-medium">
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span>Archival-quality prints</span>
        </div>
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <span>Handcrafted in India</span>
        </div>
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <rect x="1" y="3" width="15" height="13" rx="2" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          <span>Safe, tracked delivery</span>
        </div>
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span>Happiness guaranteed</span>
        </div>
      </div>

      {/* 3 Values Columns */}
      <div className="grid md:grid-cols-3 gap-8 my-16">
        <div>
          <h3 className="font-display text-lg font-bold text-ink mb-2">Thoughtfully made</h3>
          <p className="text-xs text-ink/70 leading-relaxed">
            Timeless profiles and finishes that keep the focus on your photograph.
          </p>
        </div>
        <div>
          <h3 className="font-display text-lg font-bold text-ink mb-2">Unmistakably yours</h3>
          <p className="text-xs text-ink/70 leading-relaxed">
            Your photos, your crops, your story. Preview everything before ordering.
          </p>
        </div>
        <div>
          <h3 className="font-display text-lg font-bold text-ink mb-2">Care, all the way</h3>
          <p className="text-xs text-ink/70 leading-relaxed">
            From print checks to protective packaging, small details make the difference.
          </p>
        </div>
      </div>

      <div className="pt-4 mb-8">
        <Link
          href="/category"
          className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-gold hover:bg-gold-deep text-ink text-sm font-semibold transition-colors shadow-sm"
        >
          Find your frame →
        </Link>
      </div>
    </div>
  );
}

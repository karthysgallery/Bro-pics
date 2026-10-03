import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '../../../components/content/PageIntro';
import { PictureQualityGuide } from '../../../components/product/PictureQualityGuide';
import { getPageBySlug } from '../../../lib/firestore-content';
import { contentPageMetadata } from '../../../lib/content-page-metadata';

const FALLBACK_METADATA: Metadata = {
  title: 'Picture quality guide — BroPics',
  description: 'What makes a photo print sharply, what the quality reading in the editor means, and how to fix a low reading.',
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug('picture-quality-guide').catch(() => null);
  return contentPageMetadata(page, FALLBACK_METADATA);
}

export default async function PictureQualityGuidePage() {
  const page = await getPageBySlug('picture-quality-guide').catch(() => null);
  if (page) {
    return (
      <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
        <PageIntro title={page.title} />
        <PictureQualityGuide />
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
        <span className="text-ink font-medium">Quality guide</span>
      </nav>

      <div className="mb-10">
        <h1 className="font-display text-3xl md:text-5xl font-bold text-ink mb-3 leading-tight">
          A sharper photo. A better frame.
        </h1>
        <p className="text-sm md:text-base text-ink/70">
          A few small choices make a big difference to your print.
        </p>
      </div>

      {/* Hero Story Split */}
      <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center my-12">
        <div className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-tint shadow-sm border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=1000&auto=format&fit=crop&q=80"
            alt="Artisan checking photo print quality"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="space-y-4 text-sm text-ink/80 leading-relaxed">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-ink mb-2">
            Start with the original.
          </h2>
          <p>
            Upload the full-resolution photo from your camera or phone. Avoid screenshots, social-media downloads and heavily compressed files.
          </p>
          <p>
            The Studio checks the effective DPI after cropping. Bigger prints need more pixels. A closer crop can reduce resolution.
          </p>
          <div className="pt-2">
            <span className="inline-flex items-center px-4 py-1.5 rounded-full border border-green-300 bg-green-50 text-green-800 text-xs font-semibold">
              300 DPI · Ideal for crisp detail
            </span>
          </div>
        </div>
      </div>

      {/* Resolution Table */}
      <div className="my-16 overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full min-w-[500px] text-left text-xs">
          <thead className="bg-tint/60 text-2xs uppercase tracking-wider font-bold text-ink/60 border-b border-line">
            <tr>
              <th className="px-5 py-3.5">Frame size</th>
              <th className="px-5 py-3.5">Recommended photo</th>
              <th className="px-5 py-3.5">Print area</th>
              <th className="px-5 py-3.5">Best for</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-ink/80">
            <tr>
              <td className="px-5 py-3.5 font-bold text-ink">8 × 10 in</td>
              <td className="px-5 py-3.5">2,400 × 3,000 px</td>
              <td className="px-5 py-3.5">Portrait 4:5</td>
              <td className="px-5 py-3.5">Phone portraits</td>
            </tr>
            <tr>
              <td className="px-5 py-3.5 font-bold text-ink">12 × 16 in</td>
              <td className="px-5 py-3.5">3,600 × 4,800 px</td>
              <td className="px-5 py-3.5">Portrait 3:4</td>
              <td className="px-5 py-3.5">Favourite moments</td>
            </tr>
            <tr>
              <td className="px-5 py-3.5 font-bold text-ink">16 × 20 in</td>
              <td className="px-5 py-3.5">4,800 × 6,000 px</td>
              <td className="px-5 py-3.5">Portrait 4:5</td>
              <td className="px-5 py-3.5">Statement prints</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 3 DPI Tier Cards */}
      <div className="grid md:grid-cols-3 gap-6 my-12">
        <div className="rounded-2xl border border-line bg-paper p-6">
          <span className="inline-block px-3 py-1 rounded-full border border-green-300 bg-green-50 text-green-800 text-2xs font-semibold mb-3">
            Excellent · 300+ DPI
          </span>
          <p className="text-xs text-ink/70 leading-relaxed">
            Clean edges and fine detail, even up close.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-paper p-6">
          <span className="inline-block px-3 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-800 text-2xs font-semibold mb-3">
            Good · 150–299 DPI
          </span>
          <p className="text-xs text-ink/70 leading-relaxed">
            Suitable for most wall displays at a normal distance.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-paper p-6">
          <span className="inline-block px-3 py-1 rounded-full border border-orange-300 bg-orange-50 text-orange-800 text-2xs font-semibold mb-3">
            Low · Under 150 DPI
          </span>
          <p className="text-xs text-ink/70 leading-relaxed">
            May look soft or pixelated. Try a smaller frame or replace the photo.
          </p>
        </div>
      </div>

      <p className="text-2xs text-ink/50 my-6">
        Screens and prints can vary slightly in colour. We use colour-managed printing and inspect every frame before dispatch.
      </p>

      <div className="pt-4 mb-8">
        <Link
          href="/category"
          className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-gold hover:bg-gold-deep text-ink text-sm font-semibold transition-colors shadow-sm"
        >
          Choose a frame
        </Link>
      </div>
    </div>
  );
}

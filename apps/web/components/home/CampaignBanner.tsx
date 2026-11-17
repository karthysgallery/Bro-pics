import Link from 'next/link';
import type { ShopBanner } from '../../lib/firestore-campaigns';

/** A media-library picture at a given width (other URLs are used as they are). */
function at(url: string, width: number): string {
  if (/^\/api\/media\/[^/]+\/image/.test(url)) return /[?&]w=\d+/.test(url) ? url.replace(/([?&])w=\d+/, `$1w=${width}`) : `${url}${url.includes('?') ? '&' : '?'}w=${width}`;
  return url;
}

type Shape = 'desktop' | 'tablet' | 'mobile';
// Box shape per screen, matching the picture actually shown there, so nothing jumps while it loads.
const BOX: Record<Shape, Record<Shape, string>> = {
  // [screen][picture used]
  mobile: { mobile: 'aspect-[4/5]', tablet: 'aspect-[4/3]', desktop: 'aspect-[8/3]' },
  tablet: { mobile: 'sm:aspect-[4/5]', tablet: 'sm:aspect-[4/3]', desktop: 'sm:aspect-[8/3]' },
  desktop: { mobile: 'lg:aspect-[4/5]', tablet: 'lg:aspect-[4/3]', desktop: 'lg:aspect-[8/3]' },
};
const WIDTHS: Record<Shape, number[]> = { desktop: [1280, 1920], tablet: [800, 1200], mobile: [720, 1080] };

/**
 * The homepage offer banner. Three separately designed pictures — desktop (8:3), tablet (4:3), phone (4:5) — and
 * the browser downloads only the one for its screen (<picture> with media queries). A missing picture falls back
 * to the nearest one that exists; with none at all, a text banner in the shop's colours is shown instead, so a
 * banner is never a broken image.
 */
export function CampaignBanner({ banner }: { banner: ShopBanner }) {
  const pics: Record<Shape, string> = { desktop: banner.image, tablet: banner.tabletImage, mobile: banner.mobileImage };
  const order: Record<Shape, Shape[]> = { desktop: ['desktop', 'tablet', 'mobile'], tablet: ['tablet', 'desktop', 'mobile'], mobile: ['mobile', 'tablet', 'desktop'] };
  const pick = (screen: Shape): Shape | null => order[screen].find((s) => pics[s]) ?? null;
  const used = { desktop: pick('desktop'), tablet: pick('tablet'), mobile: pick('mobile') };
  const href = banner.link || '/offers/flat-50';
  const cta = banner.ctaLabel || 'Shop the offer';
  const alt = [banner.title, banner.subtitle].filter(Boolean).join(' — ') || 'Offer';

  if (!used.mobile || !used.tablet || !used.desktop) {
    // No pictures uploaded: a text banner.
    return (
      <section className="px-4 py-6 sm:px-6" aria-label={banner.title || 'Offer'}>
        <Link
          href={href}
          className="mx-auto flex max-w-6xl flex-col items-center gap-4 rounded-card px-6 py-10 text-center sm:flex-row sm:justify-between sm:text-left"
          style={{ background: 'linear-gradient(120deg,#5c1220,#8b1d2c 55%,#6d1524)', color: '#fbf3e4' }}
        >
          <div>
            <p className="font-display text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: '#f1c96b' }}>
              {banner.title}
            </p>
            {banner.subtitle && <p className="mt-2 text-base opacity-90 sm:text-lg">{banner.subtitle}</p>}
          </div>
          <span className="inline-flex min-h-[48px] shrink-0 items-center rounded-full px-7 text-base font-semibold" style={{ background: '#f1c96b', color: '#4a0f1a' }}>
            {cta}
          </span>
        </Link>
      </section>
    );
  }

  const srcSet = (s: Shape) => WIDTHS[s].map((w) => `${at(pics[s], w)} ${w}w`).join(', ');
  const box = `${BOX.mobile[used.mobile]} ${BOX.tablet[used.tablet]} ${BOX.desktop[used.desktop]}`;

  return (
    <section className="px-0 py-4 sm:px-6 sm:py-6" aria-label={banner.title || 'Offer'}>
      <Link href={href} className="group relative mx-auto block max-w-[1920px] overflow-hidden sm:rounded-card">
        <div className={`relative w-full bg-tint ${box}`}>
          <picture>
            <source media="(min-width: 1024px)" srcSet={srcSet(used.desktop)} sizes="(min-width: 1920px) 1920px, 100vw" />
            <source media="(min-width: 640px)" srcSet={srcSet(used.tablet)} sizes="100vw" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={at(pics[used.mobile], 1080)} srcSet={srcSet(used.mobile)} sizes="100vw" alt={alt} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          </picture>
        </div>
        <span className="pointer-events-none absolute bottom-4 left-1/2 inline-flex min-h-[44px] -translate-x-1/2 items-center rounded-full px-6 text-sm font-semibold shadow-lg ring-1 ring-black/10 transition-transform group-hover:scale-[1.03] sm:bottom-6 sm:text-base" style={{ background: '#f1c96b', color: '#4a0f1a' }}>
          {cta}
        </span>
      </Link>
    </section>
  );
}

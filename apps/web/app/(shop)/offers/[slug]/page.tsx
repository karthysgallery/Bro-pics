import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getFirestore } from 'firebase-admin/firestore';
import type { Variant } from '@bro-pics/shared';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getCampaign, type ShopCampaign } from '../../../../lib/firestore-campaigns';
import { getProductBySlug, type ProductDetail } from '../../../../lib/firestore-product-detail';
import { formatPaise } from '../../../../lib/format-price';
import { SITE_NAME } from '../../../../lib/seo/site';
import { OfferViewEvent } from '../../../../components/meta/MetaEvents';

// Cached and refreshed every minute (and at once when the owner saves the page). Nothing here reads the visitor's
// address bar on the server: ad parameters (utm_*, fbclid) are picked up in the browser, so the page stays cached.
export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** "18x12 in" → "18 × 12 inch". */
const prettySize = (label: string) => label.replace(/\s*in$/i, '').replace(/\s*x\s*/i, ' × ') + ' inch';

async function load(slug: string): Promise<{ campaign: ShopCampaign; detail: ProductDetail | null } | null> {
  const campaign = await getCampaign(slug);
  if (!campaign) return null;
  const snap = await getFirestore(getAdminApp()).collection('products').doc(campaign.productId).get();
  const productSlug = snap.exists ? (snap.get('slug') as string | undefined) : undefined;
  const detail = productSlug ? await getProductBySlug(productSlug) : null;
  return { campaign, detail };
}

/** The sizes on offer, cheapest first: the campaign's chosen sizes (or all), one card per size label. */
function offerCards(campaign: ShopCampaign, variants: Variant[]): Variant[] {
  const byLabel = new Map<string, Variant>();
  for (const v of variants) {
    if (v.isActive === false) continue;
    const seen = byLabel.get(v.sizeLabel);
    if (!seen || v.price < seen.price) byLabel.set(v.sizeLabel, v);
  }
  const wanted = campaign.sizeLabels.length ? campaign.sizeLabels : [...byLabel.keys()];
  return wanted.map((l) => byLabel.get(l)).filter((v): v is Variant => Boolean(v)).sort((a, b) => a.price - b.price);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug).catch(() => null);
  if (!data) return { title: 'Offer not found', robots: { index: false } };
  const { campaign, detail } = data;
  const live = campaign.live && Boolean(detail);
  const title = `${campaign.title} — ${detail?.product.title ?? 'Photo frames'} | ${SITE_NAME}`;
  const description = [campaign.subtitle, campaign.deliveryNote].filter(Boolean).join('. ') || `${campaign.title} on handmade photo frames from ${SITE_NAME}.`;
  const image = campaign.heroImage || detail?.product.listingImageUrl || detail?.product.primaryImageUrl;
  return {
    title,
    description,
    alternates: { canonical: `/offers/${slug}` },
    robots: live ? undefined : { index: false, follow: true },
    openGraph: { type: 'website', siteName: SITE_NAME, url: `/offers/${slug}`, title, description, ...(image && { images: [{ url: image }] }) },
    twitter: { card: 'summary_large_image', title, description },
  };
}

const LAYERS: Array<[string, string]> = [
  ['Outer frame', 'Hand-finished moulding around the picture'],
  ['Protective lamination', 'Guards the print against dust and moisture'],
  ['Premium print', 'Your photo, printed sharp with true colours'],
  ['8 mm MDF backing', 'A strong board that keeps everything flat'],
  ['Back fixing', 'Push fittings hold the layers firmly in the frame'],
  ['Wall hook', 'Fitted on the back, ready to hang'],
];

export default async function OfferPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { campaign, detail } = data;

  if (!campaign.live || !detail) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="font-display text-3xl font-semibold text-ink">{campaign.live ? 'This offer is coming soon' : 'This offer is not running right now'}</h1>
        <p className="mt-3 text-ink/70">Our handmade photo frames are still available in the shop.</p>
        <Link href="/category" className="mt-6 inline-flex min-h-[48px] items-center rounded-full bg-ink px-7 font-semibold text-paper">
          Browse frames
        </Link>
      </div>
    );
  }

  const { product, variants, reviews } = detail;
  const cards = offerCards(campaign, variants);
  const hero = campaign.heroImage || product.listingImageUrl || product.primaryImageUrl;
  const maxOff = Math.max(0, ...cards.map((v) => (v.compareAtPrice && v.compareAtPrice > v.price ? Math.round((1 - v.price / v.compareAtPrice) * 100) : 0)));
  const frameIn = 1; // the shop's frames add about 1 inch of moulding on each side
  const productHref = (v?: Variant) => `/product/${product.slug}${v ? `?variantId=${encodeURIComponent(v.id)}` : ''}`;
  const faqJsonLd = campaign.faq.length
    ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: campaign.faq.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) }
    : null;

  return (
    <div className="bg-paper">
      <OfferViewEvent productId={product.id} productName={product.title} valuePaise={cards[0]?.price ?? 0} campaign={campaign.slug} />
      {faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c') }} />}

      {/* 1. Hero: what you get, at a glance. */}
      <section className="px-4 pb-8 pt-6 sm:px-6 sm:pt-10" style={{ background: 'linear-gradient(180deg,#f7efe2 0%,#fbf7f0 100%)' }}>
        <div className="mx-auto grid max-w-6xl items-center gap-6 md:grid-cols-2 md:gap-10">
          <div className="order-2 text-center md:order-1 md:text-left">
            <p className="text-sm font-semibold tracking-wide" style={{ color: '#8b1d2c' }}>
              {SITE_NAME} · Made with love, packed with care
            </p>
            <h1 className="mt-2 font-display text-5xl font-bold leading-[1.05] sm:text-6xl" style={{ color: '#8b1d2c' }}>
              {campaign.title}
            </h1>
            {campaign.subtitle && <p className="mt-3 text-lg text-ink/80 sm:text-xl">{campaign.subtitle}</p>}
            {cards[0] && (
              <p className="mt-4 text-ink">
                Frames from <span className="font-display text-3xl font-semibold" style={{ color: '#8b1d2c' }}>{formatPaise(cards[0].price)}</span>
                {cards[0].compareAtPrice && cards[0].compareAtPrice > cards[0].price && <span className="ml-2 text-ink/50 line-through">{formatPaise(cards[0].compareAtPrice)}</span>}
              </p>
            )}
            {campaign.deliveryNote && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-paper px-4 py-2 text-sm font-semibold text-ink shadow-sm ring-1 ring-line">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
                  <circle cx="7" cy="18" r="1.6" />
                  <circle cx="17" cy="18" r="1.6" />
                </svg>
                {campaign.deliveryNote}
              </p>
            )}
            <div className="mt-6">
              <a href="#sizes" className="inline-flex min-h-[52px] items-center rounded-full px-8 text-base font-semibold shadow-md" style={{ background: '#8b1d2c', color: '#fbf3e4' }}>
                {campaign.ctaLabel || 'Shop now'}
              </a>
            </div>
          </div>
          <div className="order-1 md:order-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {hero && <img src={hero} alt={`${product.title} — ${campaign.title}`} fetchPriority="high" className="mx-auto max-h-[60vh] w-auto rounded-card object-contain shadow-lg" />}
          </div>
        </div>
      </section>

      {/* 2. The sizes on offer, each opening the product with that size chosen. */}
      <section id="sizes" className="scroll-mt-20 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center font-display text-3xl font-semibold text-ink">Selected frames — special offer</h2>
          <p className="mt-2 text-center text-ink/70">Pick a size, add your photo, and see it framed before you pay.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((v) => {
              const off = v.compareAtPrice && v.compareAtPrice > v.price ? Math.round((1 - v.price / v.compareAtPrice) * 100) : 0;
              return (
                <Link key={v.id} href={productHref(v)} className="group flex flex-col rounded-card border border-line bg-paper p-5 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-ink/60">Picture size</p>
                      <p className="font-display text-2xl font-semibold text-ink">{prettySize(v.sizeLabel)}</p>
                    </div>
                    {off > 0 && (
                      <span className="rounded-full px-3 py-1 text-sm font-bold" style={{ background: '#8b1d2c', color: '#fbf3e4' }}>
                        {off}% OFF
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-baseline gap-3">
                    <span className="font-display text-4xl font-bold" style={{ color: '#8b1d2c' }}>
                      {formatPaise(v.price)}
                    </span>
                    {off > 0 && <span className="text-lg text-ink/50 line-through">{formatPaise(v.compareAtPrice!)}</span>}
                  </div>
                  <p className="mt-1 text-sm text-ink/60">With frame about {v.widthIn + 2 * frameIn} × {v.heightIn + 2 * frameIn} inch</p>
                  {campaign.deliveryNote && <p className="mt-2 text-sm text-ink/70">{campaign.deliveryNote}</p>}
                  <span className="mt-5 inline-flex min-h-[48px] items-center justify-center rounded-full bg-ink px-6 font-semibold text-paper group-hover:bg-ink/90">Choose this size</span>
                </Link>
              );
            })}
          </div>
          {maxOff > 0 && <p className="mt-4 text-center text-xs text-ink/50">Offer prices are already applied; discount codes are not needed.</p>}
        </div>
      </section>

      {/* 3–4. Quality and how it is made. */}
      <section className="bg-tint/50 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center font-display text-3xl font-semibold text-ink">Premium quality, crafted layer by layer</h2>
          <ol className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-2">
            {LAYERS.map(([name, note], i) => (
              <li key={name} className="flex gap-3 rounded-card bg-paper p-4 shadow-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ background: '#f1c96b', color: '#4a0f1a' }}>
                  {i + 1}
                </span>
                <span>
                  <span className="block font-semibold text-ink">{name}</span>
                  <span className="text-sm text-ink/70">{note}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 5. Size guide, from the product's own sizes. */}
      <section className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center font-display text-3xl font-semibold text-ink">Size guide</h2>
          <table className="mt-6 w-full overflow-hidden rounded-card text-left text-sm shadow-sm ring-1 ring-line">
            <thead style={{ background: '#6b4a2b', color: '#fbf3e4' }}>
              <tr>
                <th className="px-4 py-3 font-semibold">Picture size</th>
                <th className="px-4 py-3 font-semibold">With frame (approx.)</th>
                <th className="px-4 py-3 font-semibold">Offer price</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((v) => (
                <tr key={v.id} className="border-t border-line bg-paper">
                  <td className="px-4 py-3 font-semibold text-ink">{prettySize(v.sizeLabel)}</td>
                  <td className="px-4 py-3 text-ink/80">
                    {v.widthIn + 2 * frameIn} × {v.heightIn + 2 * frameIn} inch
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink">{formatPaise(v.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-center text-sm text-ink/60">Every size comes in portrait or landscape — choose on the next page.</p>
        </div>
      </section>

      {/* 6. Reviews, only real ones. */}
      {reviews.length > 0 && (
        <section className="bg-tint/50 px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center font-display text-3xl font-semibold text-ink">What customers say</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {reviews.slice(0, 3).map((r) => (
                <figure key={r.id} className="rounded-card bg-paper p-5 shadow-sm">
                  <p className="text-gold" aria-label={`${r.rating} out of 5 stars`}>
                    {'★'.repeat(Math.round(r.rating))}
                  </p>
                  {r.body && <blockquote className="mt-2 text-sm text-ink/80">{r.body}</blockquote>}
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 7. Questions. */}
      {campaign.faq.length > 0 && (
        <section className="px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center font-display text-3xl font-semibold text-ink">Questions</h2>
            <div className="mt-6 divide-y divide-line rounded-card bg-paper shadow-sm ring-1 ring-line">
              {campaign.faq.map((f) => (
                <details key={f.question} className="group px-5 py-4">
                  <summary className="cursor-pointer list-none font-semibold text-ink">{f.question}</summary>
                  <p className="mt-2 text-sm text-ink/75">{f.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 8. Final call to action. */}
      <section className="px-4 pb-24 pt-6 text-center sm:px-6 sm:pb-16">
        <Link href={productHref(cards[0])} className="inline-flex min-h-[52px] items-center rounded-full px-8 text-base font-semibold shadow-md" style={{ background: '#8b1d2c', color: '#fbf3e4' }}>
          {campaign.ctaLabel || 'Shop now'}
        </Link>
      </section>
    </div>
  );
}

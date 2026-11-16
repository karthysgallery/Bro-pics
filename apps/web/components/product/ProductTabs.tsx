'use client';

import { useState, type ReactNode } from 'react';
import type { Product, Review, Variant } from '@bro-pics/shared';
import { PictureQualityGuide } from './PictureQualityGuide';
import { SizeChart } from './SizeChart';
import { ShippingReturnsAccordion } from './ShippingReturnsAccordion';
import { ReviewsSection } from './ReviewsSection';

/** What every KarthysGallery frame is made of (the same for every product). */
const MADE_OF = ['Premium print, sharp detail and true colours', 'Laminated to protect against dust and moisture', '8 mm MDF backing that keeps it flat', 'Plain black frame, finished by hand', 'Hook and bushes on the back, ready to hang'];

/** A section that opens and closes under the tabs (How it works, Care, FAQ…). */
function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border-b border-line py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ink">
        {title}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="pt-3 text-sm leading-relaxed text-ink/75">{children}</div>
    </details>
  );
}

/**
 * Product information as two tabs — Description (a short intro, highlights and what you get, in bullets rather than
 * paragraphs) and Reviews — with how it works, sizes, picture quality, care, FAQ and shipping folded underneath.
 */
export function ProductTabs({ product, variants = [], reviews }: { product: Product; variants?: Variant[]; reviews?: Review[] }) {
  const [tab, setTab] = useState<'description' | 'reviews'>('description');
  const sizes = [...new Set(variants.filter((v) => v.isActive !== false).map((v) => v.sizeLabel).filter(Boolean))];
  const tabs: Array<['description' | 'reviews', string]> = [
    ['description', 'Description'],
    ...(reviews ? ([['reviews', `Reviews${product.ratingCount ? ` (${product.ratingCount})` : ''}`]] as Array<['reviews', string]>) : []),
  ];

  return (
    <section className="mt-12" aria-label="Product information">
      <div role="tablist" className="flex gap-6 border-b border-line">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-1 pb-3 font-display text-lg transition-colors ${tab === id ? 'border-gold font-semibold text-ink' : 'border-transparent text-ink/50 hover:text-ink/80'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'description' && (
        <div role="tabpanel" className="grid gap-8 pt-6 md:grid-cols-2">
          <div className="space-y-5">
            {product.shortDesc && <p className="text-[15px] leading-relaxed text-ink/80">{product.shortDesc}</p>}
            {product.highlights.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent">Highlights</h3>
                <ul className="space-y-2">
                  {product.highlights.slice(0, 6).map((h) => (
                    <li key={h} className="flex gap-2.5 text-sm text-ink/80">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="space-y-4 rounded-card bg-tint/60 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">What you get</h3>
            <ul className="space-y-2">
              {MADE_OF.map((m) => (
                <li key={m} className="flex gap-2.5 text-sm text-ink/80">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0 text-accent">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {m}
                </li>
              ))}
            </ul>
            <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
              {sizes.length > 0 && (
                <div>
                  <dt className="text-xs text-ink/55">Sizes</dt>
                  <dd className="font-semibold text-ink">{sizes.join(' · ')}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-ink/55">Dispatch</dt>
                <dd className="font-semibold text-ink">
                  {product.dispatchDaysMin === product.dispatchDaysMax ? product.dispatchDaysMin : `${product.dispatchDaysMin}–${product.dispatchDaysMax}`} working days
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {tab === 'reviews' && reviews && (
        <div role="tabpanel" className="pt-2">
          <ReviewsSection product={product} reviews={reviews} />
        </div>
      )}

      <div className="mt-6">
        {product.howItWorks.length > 0 && (
          <Fold title="How it works">
            <ol className="list-decimal space-y-1 pl-5">
              {product.howItWorks.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Fold>
        )}
        {variants.length > 0 && (
          <Fold title="Size chart">
            <SizeChart variants={variants} />
          </Fold>
        )}
        <Fold title="Picture quality guide">
          <PictureQualityGuide />
        </Fold>
        {product.careText && (
          <Fold title="Care">
            <p>{product.careText}</p>
          </Fold>
        )}
        {product.faq.length > 0 && (
          <Fold title="FAQ">
            <div className="space-y-3">
              {product.faq.map((entry) => (
                <div key={entry.question}>
                  <p className="font-semibold text-ink">{entry.question}</p>
                  <p>{entry.answer}</p>
                </div>
              ))}
            </div>
          </Fold>
        )}
        <Fold title="Shipping & returns">
          <ShippingReturnsAccordion dispatchDaysMin={product.dispatchDaysMin} dispatchDaysMax={product.dispatchDaysMax} />
        </Fold>
      </div>
    </section>
  );
}

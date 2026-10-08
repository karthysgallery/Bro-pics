'use client';

import { useMemo, useState } from 'react';
import { analyseProductSeo, suggestSeo } from '@bro-pics/shared';
import { FormField } from './AdminForm';
import { CANONICAL_ORIGIN } from '../../lib/seo/site';

export interface ProductSeoValue {
  seoTitle: string;
  seoDesc: string;
  focusKeyword: string;
  keywords: string[];
  imageAlt: string;
  noindex: boolean;
}

interface ProductSeoPanelProps {
  value: ProductSeoValue;
  onChange: (next: Partial<ProductSeoValue>) => void;
  /** Product fields the check reads but this tab doesn't edit. */
  product: { title: string; slug: string; shortDesc: string; descriptionHtml: string; hasImage: boolean };
  onSlugChange: (slug: string) => void;
  /** Publishing state from the Publishing tab: only a published product is in the sitemap and indexable. */
  publishStatus?: 'published' | 'draft' | 'archived';
}

// Always the public address — the same one canonicals, sitemaps and structured data use.
const SITE_URL = CANONICAL_ORIGIN;
const inputClass =
  'w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold';

function Counter({ length, min, max }: { length: number; min: number; max: number }) {
  const ok = length >= min && length <= max;
  return (
    <span className={`text-[11px] tabular-nums ${ok ? 'text-green-700' : 'text-ink/50'}`}>
      {length} / {max}
    </span>
  );
}

export function ProductSeoPanel({ value, onChange, product, onSlugChange, publishStatus = 'published' }: ProductSeoPanelProps) {
  const [keywordDraft, setKeywordDraft] = useState('');

  const report = useMemo(
    () =>
      analyseProductSeo(
        {
          ...product,
          seoTitle: value.seoTitle,
          seoDescription: value.seoDesc,
          focusKeyword: value.focusKeyword,
          keywords: value.keywords,
          imageAlt: value.imageAlt,
        },
        SITE_URL,
      ),
    [product, value],
  );
  const suggestion = suggestSeo({ title: product.title, shortDesc: product.shortDesc, focusKeyword: value.focusKeyword });
  const failing = report.checks.filter((c) => !c.ok);

  const addKeywords = (raw: string) => {
    const fresh = raw
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k && k.length <= 80 && !value.keywords.includes(k));
    if (fresh.length > 0) onChange({ keywords: [...value.keywords, ...fresh].slice(0, 15) });
    setKeywordDraft('');
  };

  const fillSuggestions = () =>
    onChange({
      seoTitle: value.seoTitle || suggestion.seoTitle,
      seoDesc: value.seoDesc || suggestion.seoDescription,
      imageAlt: value.imageAlt || suggestion.imageAlt,
    });

  const gradeColour =
    report.grade === 'good' ? 'text-green-700 border-green-600' : report.grade === 'fair' ? 'text-amber-700 border-amber-500' : 'text-red-700 border-red-500';

  return (
    <div className="space-y-6">
      {/* Score + Google preview */}
      <div className="grid gap-4 md:grid-cols-[auto,1fr]">
        <div className={`flex flex-col items-center justify-center rounded-2xl border-2 px-6 py-4 ${gradeColour}`} aria-label={`SEO score ${report.score} out of 100`}>
          <span className="text-3xl font-bold tabular-nums">{report.score}</span>
          <span className="text-[11px] uppercase tracking-wide font-semibold">
            {report.grade === 'good' ? 'Good' : report.grade === 'fair' ? 'Needs work' : 'Poor'}
          </span>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4" aria-label="Google search preview">
          <p className="text-[11px] text-ink/50 mb-1">How it can look on Google</p>
          <p className="text-xs text-[#202124] truncate">{report.preview.url}</p>
          <p className="text-lg leading-snug text-[#1a0dab] line-clamp-1">{report.preview.title}</p>
          <p className="text-[13px] leading-snug text-[#4d5156] line-clamp-2">{report.preview.description || 'Add a description so Google has something to show.'}</p>
        </div>
      </div>

      {/* What search engines will actually be told about this page. All of it follows automatically from the product's data and status. */}
      <div className="rounded-2xl border border-line bg-field/50 p-4 text-xs" data-testid="seo-status">
        <p className="text-2xs font-bold uppercase tracking-wider text-ink">Search status</p>
        <dl className="mt-2 grid gap-1.5 sm:grid-cols-[170px_1fr]">
          <dt className="text-ink/60">Page address (canonical)</dt>
          <dd className="break-all font-mono text-ink">{`${SITE_URL}/product/${product.slug}`}</dd>
          <dt className="text-ink/60">Search engines</dt>
          <dd className={publishStatus === 'published' && !value.noindex ? 'font-semibold text-green-700' : 'font-semibold text-alert'}>
            {publishStatus !== 'published' ? `Hidden — this product is ${publishStatus}` : value.noindex ? 'Hidden — “keep out of search engines” is ticked' : 'Can be indexed'}
          </dd>
          <dt className="text-ink/60">Sitemap</dt>
          <dd className="text-ink">{publishStatus === 'published' && !value.noindex ? 'Included automatically (updates within the hour, or at once when you save)' : 'Not included'}</dd>
          <dt className="text-ink/60">Product data for Google</dt>
          <dd className="text-ink">Generated automatically from the name, photos, sizes, prices and stock; sizes become variants of one product</dd>
          <dt className="text-ink/60">Google Merchant feed</dt>
          <dd className="text-ink">{publishStatus === 'published' && !value.noindex ? 'Included, one line per size' : 'Not included'}</dd>
        </dl>
        {publishStatus === 'archived' && <p className="mt-2 text-ink/70">An archived product&apos;s page returns “not found”, so search engines drop it.</p>}
      </div>

      <FormField label="Focus keyword" hint='The exact phrase customers type into Google, e.g. "vijay photo frame"'>
        <input
          type="text"
          value={value.focusKeyword}
          maxLength={80}
          onChange={(e) => onChange({ focusKeyword: e.target.value })}
          placeholder="vijay photo frame"
          className={inputClass}
        />
      </FormField>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={fillSuggestions}
          className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-gold text-ink hover:bg-gold/10"
        >
          Fill empty fields with suggestions
        </button>
        {value.focusKeyword.trim() && suggestion.slug !== product.slug && (
          <button
            type="button"
            onClick={() => onSlugChange(suggestion.slug)}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-line text-ink/80 hover:bg-ink/5"
          >
            Use address /product/{suggestion.slug}
          </button>
        )}
      </div>

      <FormField label="Search title" hint="Leave blank to use “Product name | KarthysGallery”">
        <input
          type="text"
          value={value.seoTitle}
          maxLength={120}
          onChange={(e) => onChange({ seoTitle: e.target.value })}
          placeholder={suggestion.seoTitle}
          className={inputClass}
        />
        <div className="mt-1 flex justify-end">
          <Counter length={value.seoTitle.length} min={30} max={65} />
        </div>
      </FormField>

      <FormField label="Search description" hint="Leave blank to use the short description">
        <textarea
          rows={3}
          value={value.seoDesc}
          maxLength={320}
          onChange={(e) => onChange({ seoDesc: e.target.value })}
          placeholder={suggestion.seoDescription}
          className={inputClass}
        />
        <div className="mt-1 flex justify-end">
          <Counter length={value.seoDesc.length} min={110} max={160} />
        </div>
      </FormField>

      <FormField label="Related search phrases" hint="Other ways people search for this. Press Enter or comma to add (up to 15).">
        <div className="flex flex-wrap gap-1.5 mb-2" aria-label="Related search phrases">
          {value.keywords.map((k) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-[11px] text-ink">
              {k}
              <button
                type="button"
                aria-label={`Remove ${k}`}
                onClick={() => onChange({ keywords: value.keywords.filter((x) => x !== k) })}
                className="text-ink/50 hover:text-ink"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          value={keywordDraft}
          disabled={value.keywords.length >= 15}
          onChange={(e) => {
            if (e.target.value.includes(',')) addKeywords(e.target.value);
            else setKeywordDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addKeywords(keywordDraft);
            }
          }}
          onBlur={() => keywordDraft.trim() && addKeywords(keywordDraft)}
          placeholder="thalapathy vijay frame, vijay fan gift"
          className={inputClass}
        />
      </FormField>

      <FormField label="Main photo description (alt text)" hint="Read by Google Images and screen readers">
        <input
          type="text"
          value={value.imageAlt}
          maxLength={160}
          onChange={(e) => onChange({ imageAlt: e.target.value })}
          placeholder={suggestion.imageAlt}
          className={inputClass}
        />
      </FormField>

      <label className="flex items-start gap-2 text-xs text-ink">
        <input
          type="checkbox"
          checked={value.noindex}
          onChange={(e) => onChange({ noindex: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          Hide this product from Google
          <span className="block text-ink/50">The page still works for visitors, but search engines won’t list it.</span>
        </span>
      </label>

      <div>
        <h3 className="text-xs font-semibold text-ink mb-2">
          {failing.length === 0 ? 'Every check passes' : `${failing.length} thing${failing.length === 1 ? '' : 's'} to improve`}
        </h3>
        <ul className="space-y-1.5">
          {[...failing, ...report.checks.filter((c) => c.ok)].map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-xs">
              <span
                aria-hidden="true"
                className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${c.ok ? 'bg-green-600' : 'bg-red-500'}`}
              />
              <span className={c.ok ? 'text-ink/60' : 'text-ink'}>
                <span className="sr-only">{c.ok ? 'Passed: ' : 'To fix: '}</span>
                {c.label}
                {!c.ok && <span className="block text-ink/55">{c.fix}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-ink/50">
          A high score means the page is well set up. Where Google ranks it also depends on reviews, links from other sites and competition.
        </p>
      </div>
    </div>
  );
}

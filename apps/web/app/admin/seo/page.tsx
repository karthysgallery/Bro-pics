'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth-context';

interface SeoStatus {
  googleVerified: boolean;
  businessMissing: string[];
  businessName: string | null;
  legalPages: Array<{ slug: string; live: boolean }>;
  products: { published: number; indexable: number; weak: Array<{ id: string; title: string; score: number }>; weakCount: number };
  landingPages: Array<{ slug: string; title: string; keyword: string; products: number; url: string }>;
  links: { sitemap: string; merchantFeed: string; site: string };
}

const PAGE_NAMES: Record<string, string> = {
  about: 'About us',
  contact: 'Contact',
  privacy: 'Privacy policy',
  terms: 'Terms & conditions',
  'shipping-policy': 'Shipping policy',
  'return-refund-policy': 'Return & refund policy',
  'cancellation-policy': 'Cancellation policy',
  grievance: 'Grievance redressal',
};

type StepState = 'done' | 'todo' | 'info';

const BADGE: Record<StepState, { mark: string; label: string; className: string }> = {
  done: { mark: '✓', label: 'Done', className: 'bg-emerald-600 text-white' },
  todo: { mark: '!', label: 'To do', className: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' },
  info: { mark: 'i', label: 'Do once', className: 'bg-tint text-ink/70 ring-1 ring-line' },
};

function Step({ state, title, children }: { state: StepState; title: string; children?: ReactNode }) {
  const badge = BADGE[state];
  return (
    <li className="rounded-2xl border border-line bg-paper p-5">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${badge.className}`} aria-label={badge.label}>
          {badge.mark}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink">{title}</h2>
          {children && <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink/75">{children}</div>}
        </div>
      </div>
    </li>
  );
}

function Copy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-field px-2 py-1 font-mono text-xs">
      <span className="truncate">{text}</span>
      <button
        type="button"
        className="shrink-0 font-sans font-semibold text-gold-deep"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}

export default function SeoAdminPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<SeoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/seo-status', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Could not load the Google status (HTTP ${res.status}).`);
        setStatus(await res.json());
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [user]);

  if (error) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>;
  if (!status) return <div className="h-64 animate-pulse rounded-2xl border border-line bg-paper" />;

  const pagesLive = status.legalPages.filter((p) => p.live).length;

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Google & SEO</h1>
        <p className="mt-1 text-sm text-ink/65">
          What Google can see of your shop, and the few steps that only you can do. Everything else — page titles, product descriptions, sitemaps,
          structured data and the search landing pages — is done automatically.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">Your steps</h2>
        <ol className="space-y-3">
          <Step state={status.googleVerified ? 'done' : 'todo'} title="1. Connect Google Search Console (10 minutes, once)">
            {status.googleVerified ? (
              <p>
                Connected. In Search Console, make sure the sitemap <Copy text={status.links.sitemap} /> is submitted (Sitemaps → Add a new sitemap).
              </p>
            ) : (
              <>
                <p>This tells Google your shop exists and lets you see which searches show it.</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>
                    Open{' '}
                    <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                      Google Search Console
                    </a>{' '}
                    and sign in with the shop’s Google account.
                  </li>
                  <li>
                    Choose <strong>Add property → URL prefix</strong> and enter <Copy text={status.links.site} />.
                  </li>
                  <li>
                    Pick <strong>HTML tag</strong>. Copy only the code inside <code>content=&quot;…&quot;</code>.
                  </li>
                  <li>
                    Paste it in{' '}
                    <Link href="/admin/settings" className="font-semibold underline">
                      Settings → Google Search Console verification code
                    </Link>{' '}
                    and save. Wait a minute, then press <strong>Verify</strong> in Search Console.
                  </li>
                  <li>
                    In Search Console open <strong>Sitemaps</strong>, enter <Copy text="sitemap.xml" /> and press <strong>Submit</strong>.
                  </li>
                </ol>
              </>
            )}
          </Step>

          <Step state="info" title="2. Create your Google Business Profile (the shop on Google Maps)">
            <p>
              This is what puts the shop in “photo frame shop near me” results and on Google Maps. Go to{' '}
              <a href="https://business.google.com/create" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                business.google.com
              </a>
              , add the shop name, category <strong>“Picture frame shop”</strong>, your shop address and phone, and the website <Copy text={status.links.site} />. Google
              verifies it by phone, video or post. Then add 10+ photos of real frames and ask happy customers for a review — reviews are the biggest local
              ranking signal.
            </p>
          </Step>

          <Step state={status.businessMissing.length === 0 && pagesLive === status.legalPages.length ? 'done' : 'todo'} title="3. Business details and shop pages">
            {status.businessMissing.length > 0 && (
              <p>
                Still missing in{' '}
                <Link href="/admin/settings" className="font-semibold underline">
                  Settings
                </Link>
                : {status.businessMissing.join(', ')}. Google trusts shops that show a real address and phone.
              </p>
            )}
            <p>
              Shop pages live: {pagesLive} of {status.legalPages.length}.{' '}
              {pagesLive < status.legalPages.length && (
                <>
                  Not live yet: {status.legalPages.filter((p) => !p.live).map((p) => PAGE_NAMES[p.slug] ?? p.slug).join(', ')}. Review and approve them in{' '}
                  <Link href="/admin/pages" className="font-semibold underline">
                    Website → Pages
                  </Link>
                  .
                </>
              )}
            </p>
          </Step>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">Done automatically</h2>
        <ol className="space-y-3">
          <Step state="done" title={`Product pages: all ${status.products.indexable} have a Google title and description`}>
            <p>Each product page writes its own title, description and image text from the product’s name, photos and price when you leave them empty.</p>
            {status.products.weakCount > 0 && (
              <details>
                <summary className="cursor-pointer font-semibold text-ink">
                  Optional: {status.products.weakCount} products could have a fuller description
                </summary>
                <p className="mt-2">Open one, press “Generate details” → “Fill empty fields only”, then save. This adds a longer description, FAQ and search phrases.</p>
                <ul className="mt-2 space-y-1">
                  {status.products.weak.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3">
                      <Link href={`/admin/products/${p.id}`} className="truncate font-medium underline">
                        {p.title}
                      </Link>
                      <span className="shrink-0 text-xs font-semibold text-ink/55">{p.score}/100</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Step>
          <Step state="done" title="Search landing pages">
            <p>Pages written for what people type into Google. Each lists your matching products and updates by itself when you add new ones.</p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {status.landingPages.map((l) => (
                <li key={l.slug} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline">
                      {l.title}
                    </a>
                    <span className="ml-2 text-xs text-ink/55">for “{l.keyword}”</span>
                    {l.products === 0 && <span className="ml-2 text-xs text-ink/55">— shows on Google once a matching product is published</span>}
                  </span>
                  <span className={`text-xs font-semibold ${l.products ? 'text-ink/60' : 'text-amber-700'}`}>{l.products} products</span>
                </li>
              ))}
            </ul>
          </Step>
          <Step state="done" title="Sitemap, structured data and Google Shopping feed">
            <p>
              Sitemap: <Copy text={status.links.sitemap} />
            </p>
            <p>
              Optional: list your products free on Google Shopping by adding this feed in{' '}
              <a href="https://merchants.google.com" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                Google Merchant Center
              </a>
              : <Copy text={status.links.merchantFeed} />
            </p>
          </Step>
        </ol>
      </section>
    </div>
  );
}

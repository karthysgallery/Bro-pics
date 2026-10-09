'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_FRAMING_COST_RATES,
  analyseProductSeo,
  generateProductDetails,
  sizeLabelOf,
  slugify,
  type FrameModel,
  type FramingCostRates,
  type ProductType,
} from '@bro-pics/shared';
import { useAdminApi } from '../template-builder/use-admin-api';
import { useToast } from '../../ui/Toast';
import { ProductSeoPanel, type ProductSeoValue } from '../ProductSeoPanel';
import { PricingGrid, newRowKey, syncRowsWithModels, type EditorRow } from './PricingGrid';
import { FramedPreview, lookOf } from './FramedPreview';
import { htmlToText, textToHtml } from './rich-text';
import { inr, useCatalogueUpload } from './use-catalogue-upload';

interface Options {
  categories: Array<{ id: string; name: string; slug: string }>;
  frameModels: FrameModel[];
  rates: FramingCostRates;
  collageTemplates: Array<{ id: string; name: string; type: string; publishedVersion: number | null; latestStatus: string }>;
}

interface GalleryItem {
  mediaId: string | null;
  url: string;
  alt: string;
}

interface State {
  productType: ProductType | null;
  isLegacy: boolean;
  title: string;
  slug: string;
  productCode: string;
  categoryId: string;
  subject: string;
  shortDesc: string;
  description: string;
  highlights: string;
  howItWorks: string;
  careText: string;
  faq: Array<{ question: string; answer: string }>;
  badges: string;
  occasionTags: string[];
  status: 'draft' | 'published' | 'archived';
  isFeatured: boolean;
  allowsTextPersonalization: boolean;
  dispatchDaysMin: number;
  dispatchDaysMax: number;
  hsnCode: string;
  seo: ProductSeoValue;
  frameModelIds: string[];
  rows: EditorRow[];
  gallery: GalleryItem[];
  artwork: { mediaId: string; url: string; widthPx: number; heightPx: number } | null;
  collageTemplateId: string | null;
}

const EMPTY: State = {
  productType: null,
  isLegacy: false,
  title: '',
  slug: '',
  productCode: '',
  categoryId: '',
  subject: '',
  shortDesc: '',
  description: '',
  highlights: '',
  howItWorks: '',
  careText: '',
  faq: [],
  badges: '',
  occasionTags: [],
  status: 'draft',
  isFeatured: false,
  allowsTextPersonalization: false,
  dispatchDaysMin: 2,
  dispatchDaysMax: 4,
  hsnCode: '',
  seo: { seoTitle: '', seoDesc: '', focusKeyword: '', keywords: [], imageAlt: '', noindex: false },
  frameModelIds: [],
  rows: [],
  gallery: [],
  artwork: null,
  collageTemplateId: null,
};

const TYPES: Array<{ type: ProductType; title: string; text: string; example: string; art: ReactNode }> = [
  {
    type: 'ready_made',
    title: 'Ready-made frame',
    text: 'Your own picture — gods, film stars, nature. Customers only choose the size and frame.',
    example: 'Lord Murugan, Rajinikanth, Tanjore art',
    art: (
      <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden="true">
        <rect x="8" y="6" width="48" height="52" rx="2" fill="#6b4226" />
        <rect x="14" y="12" width="36" height="40" fill="#f3d9a4" />
        <circle cx="32" cy="27" r="7" fill="#c9861a" />
        <path d="M20 50c3-9 8-13 12-13s9 4 12 13z" fill="#c9861a" />
      </svg>
    ),
  },
  {
    type: 'single_photo',
    title: 'Single photo frame',
    text: 'The customer uploads one photo, sees it in the frame, and orders.',
    example: 'Family photo, wedding photo, baby photo',
    art: (
      <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden="true">
        <rect x="8" y="6" width="48" height="52" rx="2" fill="#1f1f1f" />
        <rect x="14" y="12" width="36" height="40" fill="#e9eef2" />
        <path d="M14 46l10-12 8 8 6-6 12 10v6H14z" fill="#8fa9bf" />
        <circle cx="40" cy="22" r="4" fill="#f2c14e" />
        <path d="M32 26v10M27 31h10" stroke="#1f1f1f" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: 'collage',
    title: 'Collage frame',
    text: 'Many photos in a designed layout, with names, dates or a calendar.',
    example: 'Forever & Always, birthday collage, mosaic',
    art: (
      <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden="true">
        <rect x="6" y="6" width="52" height="52" rx="2" fill="#c9a227" />
        <rect x="11" y="11" width="20" height="24" fill="#e9eef2" />
        <rect x="33" y="11" width="20" height="13" fill="#d7e3ec" />
        <rect x="33" y="26" width="20" height="9" fill="#d7e3ec" />
        <rect x="11" y="37" width="13" height="16" fill="#d7e3ec" />
        <rect x="26" y="37" width="27" height="16" fill="#e9eef2" />
      </svg>
    ),
  },
];

const field = 'h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-ink';
const area = 'w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink outline-none focus:border-ink';
const label = 'mb-1 block text-2xs font-bold uppercase tracking-wider text-ink/60';
const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

function Section({ id, step, title, hint, children, done }: { id: string; step: number; title: string; hint?: string; children: ReactNode; done?: boolean }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-2xl border border-line bg-paper p-5 md:p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-600 text-white' : 'bg-ink text-paper'}`}>{done ? '✓' : step}</span>
        <div>
          <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-ink/60">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

/**
 * The guided product editor: pick the kind of frame, name it (and let
 * "Generate details" write the rest), choose frame models, price every
 * size, add photos — one Save writes the product, its sizes, private costs
 * and the print design.
 */
export function ProductEditor({ productId }: { productId: string | null }) {
  const api = useAdminApi();
  const upload = useCatalogueUpload();
  const router = useRouter();
  const { showToast } = useToast();
  const [options, setOptions] = useState<Options | null>(null);
  const [s, setS] = useState<State>(EMPTY);
  const [loaded, setLoaded] = useState(productId === null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [askGenerate, setAskGenerate] = useState(false);
  const [slugTouched, setSlugTouched] = useState(productId !== null);
  const artworkInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const set = useCallback((patch: Partial<State>) => {
    setS((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  const loadOptions = useCallback(async () => {
    const o = await api<Options>('/api/admin/products/setup/options');
    setOptions(o);
    return o;
  }, [api]);

  useEffect(() => {
    (async () => {
      try {
        const o = await loadOptions();
        if (productId === null) {
          setS((prev) => ({ ...prev, categoryId: prev.categoryId || o.categories[0]?.id || '', frameModelIds: o.frameModels.filter((m) => m.isActive).slice(0, 1).map((m) => m.id) }));
          return;
        }
        const r = await api<{
          product: Omit<State, 'description' | 'highlights' | 'howItWorks' | 'badges' | 'seo' | 'rows' | 'gallery'> & {
            descriptionHtml: string;
            highlights: string[];
            howItWorks: string[];
            badges: string[];
            seo: { title: string; description: string; focusKeyword: string; keywords: string[]; imageAlt: string; noindex: boolean };
          };
          rows: Array<Omit<EditorRow, 'key'>>;
          gallery: GalleryItem[];
        }>(`/api/admin/products/${productId}/setup`);
        const p = r.product;
        setS({
          ...EMPTY,
          ...p,
          description: htmlToText(p.descriptionHtml),
          highlights: p.highlights.join('\n'),
          howItWorks: p.howItWorks.join('\n'),
          badges: p.badges.join(', '),
          seo: { seoTitle: p.seo.title, seoDesc: p.seo.description, focusKeyword: p.seo.focusKeyword, keywords: p.seo.keywords, imageAlt: p.seo.imageAlt, noindex: p.seo.noindex },
          rows: r.rows.map((row) => ({ ...row, key: newRowKey() })),
          gallery: r.gallery,
        });
        setLoaded(true);
        try {
          const carried = sessionStorage.getItem(`product-save-warnings:${productId}`);
          if (carried) {
            sessionStorage.removeItem(`product-save-warnings:${productId}`);
            setWarnings(JSON.parse(carried) as string[]);
          }
        } catch {
          /* nothing carried over */
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The product could not be loaded.');
      }
    })();
  }, [api, loadOptions, productId]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const models = options?.frameModels ?? [];
  const rates = options?.rates ?? DEFAULT_FRAMING_COST_RATES;
  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const defaultModel = byId.get(s.frameModelIds[0] ?? '') ?? null;
  const activeRows = s.rows.filter((r) => r.isActive);
  const sizeLabels = [...new Set([...activeRows].sort((a, b) => a.widthIn * a.heightIn - b.widthIn * b.heightIn).map((r) => sizeLabelOf(r.widthIn, r.heightIn)))];
  const hasImage = s.gallery.length > 0 || Boolean(s.artwork);
  const descriptionHtml = useMemo(() => textToHtml(s.description), [s.description]);
  const seoReport = analyseProductSeo({
    title: s.title,
    slug: s.slug,
    shortDesc: s.shortDesc,
    descriptionHtml,
    seoTitle: s.seo.seoTitle,
    seoDescription: s.seo.seoDesc,
    focusKeyword: s.seo.focusKeyword,
    keywords: s.seo.keywords,
    imageAlt: s.seo.imageAlt,
    hasImage,
  });
  const firstPreviewRow = activeRows.find((r) => r.frameModelId === s.frameModelIds[0]) ?? activeRows[0];

  const onTitle = (title: string) => {
    const patch: Partial<State> = { title };
    if (!slugTouched) patch.slug = slugify(title);
    if (!s.productCode || s.productCode === slugify(s.title).replace(/-/g, '').slice(0, 12).toUpperCase()) patch.productCode = slugify(title).replace(/-/g, '').slice(0, 12).toUpperCase();
    set(patch);
  };

  const toggleModel = (id: string) => {
    const ids = s.frameModelIds.includes(id) ? s.frameModelIds.filter((m) => m !== id) : [...s.frameModelIds, id];
    set({ frameModelIds: ids, rows: syncRowsWithModels(s.rows, ids, models, rates) });
  };
  const makeDefault = (id: string) => set({ frameModelIds: [id, ...s.frameModelIds.filter((m) => m !== id)] });

  const generate = (mode: 'empty' | 'all') => {
    if (!s.productType) return;
    const out = generateProductDetails({
      name: s.title || s.subject,
      productType: s.productType,
      subject: s.subject || undefined,
      categoryName: options?.categories.find((c) => c.id === s.categoryId)?.name,
      sizeLabels,
      frameModels: s.frameModelIds.map((id) => byId.get(id)).filter((m): m is FrameModel => Boolean(m)).map((m) => ({ name: m.name, colour: m.colour, material: m.material })),
      dispatchDaysMin: s.dispatchDaysMin,
      dispatchDaysMax: s.dispatchDaysMax,
    });
    const keep = <T,>(current: T, next: T, empty: boolean) => (mode === 'all' || empty ? next : current);
    set({
      title: keep(s.title, out.title, !s.title),
      slug: keep(s.slug, out.slug, !s.slug || !slugTouched),
      productCode: s.productCode || out.productCode,
      shortDesc: keep(s.shortDesc, out.shortDesc, !s.shortDesc),
      description: keep(s.description, htmlToText(out.descriptionHtml), !s.description),
      highlights: keep(s.highlights, out.highlights.join('\n'), !s.highlights),
      howItWorks: keep(s.howItWorks, out.howItWorks.join('\n'), !s.howItWorks),
      careText: keep(s.careText, out.careText, !s.careText),
      faq: keep(s.faq, out.faq, s.faq.length === 0),
      badges: keep(s.badges, out.badges.join(', '), !s.badges),
      occasionTags: keep(s.occasionTags, out.occasionTags, s.occasionTags.length === 0),
      seo: {
        ...s.seo,
        seoTitle: keep(s.seo.seoTitle, out.seo.title, !s.seo.seoTitle),
        seoDesc: keep(s.seo.seoDesc, out.seo.description, !s.seo.seoDesc),
        focusKeyword: keep(s.seo.focusKeyword, out.seo.focusKeyword, !s.seo.focusKeyword),
        keywords: keep(s.seo.keywords, out.seo.keywords, s.seo.keywords.length === 0),
        imageAlt: keep(s.seo.imageAlt, out.seo.imageAlt, !s.seo.imageAlt),
      },
    });
    setSlugTouched(true);
    setAskGenerate(false);
    showToast(mode === 'all' ? 'Details written — read them once before publishing' : 'Empty fields filled', 'success');
  };
  const hasContent = Boolean(s.shortDesc || s.description || s.faq.length || s.seo.seoTitle);

  const uploadArtwork = async (file: File) => {
    setUploading('artwork');
    try {
      const img = await upload(file, { alt: s.title ? `${s.title} artwork` : 'Artwork', tag: 'product-artwork' });
      set({ artwork: { mediaId: img.id, url: img.url, widthPx: img.width, heightPx: img.height } });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed', 'error');
    } finally {
      setUploading(null);
    }
  };
  const uploadGallery = async (files: FileList) => {
    setUploading('gallery');
    try {
      const added: GalleryItem[] = [];
      for (const file of Array.from(files).slice(0, 12)) {
        const img = await upload(file, { alt: s.seo.imageAlt || s.title, tag: 'product-photo' });
        added.push({ mediaId: img.id, url: img.url, alt: s.seo.imageAlt || s.title });
      }
      set({ gallery: [...s.gallery, ...added] });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed', 'error');
    } finally {
      setUploading(null);
    }
  };
  const moveGallery = (i: number, by: number) => {
    const g = [...s.gallery];
    const [item] = g.splice(i, 1);
    g.splice(Math.max(0, Math.min(g.length, i + by)), 0, item!);
    set({ gallery: g });
  };

  const checklist: Array<{ ok: boolean; text: string; href: string }> = [
    { ok: Boolean(s.productType), text: 'Kind of frame chosen', href: '#type' },
    { ok: s.title.trim().length >= 3 && Boolean(s.categoryId), text: 'Name and category', href: '#details' },
    {
      ok: s.productType === 'ready_made' ? Boolean(s.artwork) : s.productType === 'collage' ? Boolean(s.collageTemplateId) : s.productType === 'single_photo',
      text: s.productType === 'ready_made' ? 'Artwork uploaded' : s.productType === 'collage' ? 'Collage design chosen' : 'Photo design (automatic)',
      href: '#design',
    },
    { ok: s.frameModelIds.length > 0, text: 'Frame models chosen', href: '#frames' },
    { ok: activeRows.length > 0 && activeRows.every((r) => r.frameModelId && r.price > 0 && r.mrp >= r.price), text: 'Every size priced', href: '#prices' },
    { ok: hasImage, text: 'Product photo', href: '#photos' },
    { ok: seoReport.score === 100, text: `SEO score ${seoReport.score}/100`, href: '#seo' },
  ];
  const readyToPublish = checklist.slice(0, 5).every((c) => c.ok);

  const save = async (publish?: boolean) => {
    if (!s.productType) {
      showToast('Choose the kind of frame first.', 'error');
      return;
    }
    if (s.rows.some((r) => !r.frameModelId)) {
      showToast('Choose a frame model for every size line.', 'error');
      return;
    }
    const status = publish ? 'published' : s.status;
    if (status === 'published' && !readyToPublish) {
      showToast('Finish the checklist before publishing (it is saved as a draft until then).', 'error');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        productType: s.productType,
        title: s.title.trim(),
        slug: s.slug,
        productCode: s.productCode || slugify(s.title).replace(/-/g, '').slice(0, 12).toUpperCase() || 'FRAME',
        categoryId: s.categoryId,
        subject: s.subject.trim(),
        shortDesc: s.shortDesc.trim(),
        descriptionHtml,
        highlights: lines(s.highlights),
        howItWorks: lines(s.howItWorks),
        careText: s.careText.trim(),
        faq: s.faq.filter((f) => f.question.trim() && f.answer.trim()),
        badges: s.badges.split(',').map((b) => b.trim()).filter(Boolean).slice(0, 5),
        occasionTags: s.occasionTags,
        status,
        isFeatured: s.isFeatured,
        allowsTextPersonalization: s.allowsTextPersonalization,
        dispatchDaysMin: s.dispatchDaysMin,
        dispatchDaysMax: Math.max(s.dispatchDaysMin, s.dispatchDaysMax),
        ...(s.hsnCode.trim() && { hsnCode: s.hsnCode.trim() }),
        seo: { title: s.seo.seoTitle, description: s.seo.seoDesc, focusKeyword: s.seo.focusKeyword, keywords: s.seo.keywords, imageAlt: s.seo.imageAlt, noindex: s.seo.noindex },
        frameModelIds: s.frameModelIds,
        rows: s.rows.map(({ key: _k, legacyFinish: _l, ...r }) => ({ ...r, frameModelId: r.frameModelId! })),
        gallery: s.gallery.filter((g) => g.mediaId).map((g) => ({ mediaId: g.mediaId!, alt: g.alt })),
        artworkMediaId: s.productType === 'ready_made' ? (s.artwork?.mediaId ?? null) : null,
        collageTemplateId: s.productType === 'collage' ? s.collageTemplateId : null,
      };
      const result = await api<{ productId: string; warnings: string[] }>(productId ? `/api/admin/products/${productId}/setup` : '/api/admin/products/setup', {
        method: productId ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      setWarnings(result.warnings);
      setDirty(false);
      set({ status });
      setDirty(false);
      showToast(status === 'published' ? 'Saved and live on the shop' : 'Saved', 'success');
      if (!productId) {
        // The edit page is a fresh screen: hand it the save notes so they are not lost.
        try {
          sessionStorage.setItem(`product-save-warnings:${result.productId}`, JSON.stringify(result.warnings));
        } catch {
          /* private mode: the notes are simply not carried over */
        }
        router.replace(`/admin/products/${result.productId}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'The product could not be saved.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (error && !loaded) return <p className="rounded-xl bg-red-50 p-4 text-sm text-alert">{error}</p>;
  if (!options || !loaded) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-xl bg-tint" />
        <div className="h-64 animate-pulse rounded-2xl bg-tint" />
      </div>
    );
  }

  const prices = activeRows.filter((r) => r.price > 0).map((r) => r.price);
  return (
    <div className="pb-28">
      {/* Header (the admin page itself does not scroll, so the actions live in the floating bar below) */}
      <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-line pb-4">
        <div className="min-w-0 flex-1">
          <Link href="/admin/products" className="text-2xs font-medium text-ink/50 hover:text-ink">
            ← Products
          </Link>
          <h1 className="truncate font-display text-2xl font-bold text-ink">{s.title || (productId ? 'Edit frame' : 'New frame')}</h1>
        </div>
        {productId && s.status === 'published' && (
          <Link href={`/product/${s.slug}`} target="_blank" className="h-10 rounded-xl border border-line px-3 text-sm font-semibold leading-10 text-ink hover:bg-field">
            View on shop ↗
          </Link>
        )}
      </div>

      {/* Floating actions: always in reach while the long form scrolls. */}
      <div className="fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-gold/20 bg-ink py-2 pl-4 pr-2 text-paper shadow-2xl md:left-[calc(50%+8rem)]">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.status === 'published' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-paper/15 text-paper/80'}`}>
          {s.status === 'published' ? 'Live' : s.status}
        </span>
        <span className="hidden text-xs text-paper/70 sm:inline">
          {checklist.filter((c) => c.ok).length}/{checklist.length} ready · SEO {seoReport.score}
          {dirty ? ' · unsaved' : ''}
        </span>
        <button type="button" disabled={saving} onClick={() => void save()} className="h-9 rounded-xl border border-paper/25 px-3 text-sm font-semibold text-paper hover:bg-paper/10 disabled:opacity-40">
          {saving ? 'Saving…' : s.status === 'published' ? 'Save changes' : 'Save draft'}
        </button>
        {s.status !== 'published' && (
          <button
            type="button"
            disabled={saving || !readyToPublish}
            title={readyToPublish ? undefined : 'Finish the checklist first'}
            onClick={() => void save(true)}
            className="h-9 rounded-xl bg-gold px-4 text-sm font-bold text-ink hover:bg-gold-deep disabled:opacity-40"
          >
            Publish
          </button>
        )}
      </div>

      {(warnings.length > 0 || error) && (
        <div className="mb-5 space-y-2">
          {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-alert">{error}</p>}
          {warnings.length > 0 && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <p className="font-bold">Saved — please check:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-5">
          {/* 1. Type */}
          <Section id="type" step={1} title="What kind of frame is this?" done={Boolean(s.productType)}>
            {s.isLegacy && <p className="mb-3 rounded-lg bg-tint px-3 py-2 text-xs text-ink/75">This product was made before the guided editor. Check the kind of frame and the size lines, then save — existing orders and carts keep working.</p>}
            <div className="grid gap-3 md:grid-cols-3">
              {TYPES.map((t) => {
                const on = s.productType === t.type;
                return (
                  <button
                    key={t.type}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ productType: t.type })}
                    className={`flex h-full flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-all ${on ? 'border-ink bg-ink/[0.03] shadow-sm' : 'border-line hover:border-ink/30'}`}
                  >
                    <span className="flex w-full items-start justify-between">
                      {t.art}
                      <span className={`h-5 w-5 rounded-full border-2 ${on ? 'border-ink bg-ink shadow-[inset_0_0_0_3px_white]' : 'border-line'}`} />
                    </span>
                    <span className="text-sm font-bold text-ink">{t.title}</span>
                    <span className="text-xs leading-relaxed text-ink/65">{t.text}</span>
                    <span className="mt-auto text-2xs text-ink/45">e.g. {t.example}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* 2. Details */}
          <Section id="details" step={2} title="Name and details" hint="Type the name, then let Generate details write the description, FAQ and SEO for you." done={s.title.trim().length >= 3 && Boolean(s.categoryId)}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className={label}>Frame name</span>
                <input className={`${field} h-12 text-base font-semibold`} value={s.title} onChange={(e) => onTitle(e.target.value)} placeholder={s.productType === 'ready_made' ? 'Lord Murugan Photo Frame' : 'Classic Family Photo Frame'} />
              </label>
              {s.productType === 'ready_made' && (
                <label className="block">
                  <span className={label}>What the picture shows</span>
                  <input className={field} value={s.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="Lord Murugan" />
                  <span className="mt-1 block text-2xs text-ink/50">The god, star or scene — people search for this.</span>
                </label>
              )}
              <label className="block">
                <span className={label}>Category</span>
                <select className={field} value={s.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                  {options.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={label}>Product code (for SKUs)</span>
                <input className={`${field} font-mono uppercase`} value={s.productCode} maxLength={12} onChange={(e) => set({ productCode: e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase() })} placeholder="MURUGAN" />
              </label>
              <label className="block">
                <span className={label}>Web address</span>
                <div className="flex items-center rounded-xl border border-line bg-field pl-3 text-sm text-ink/50 focus-within:border-ink">
                  /product/
                  <input
                    className="h-10 min-w-0 flex-1 rounded-r-xl bg-paper px-2 font-mono text-sm text-ink outline-none"
                    value={s.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      set({ slug: slugify(e.target.value) || e.target.value.toLowerCase() });
                    }}
                  />
                </div>
              </label>
            </div>
            <div className="mt-4 rounded-2xl border border-dashed border-gold/60 bg-gold/[0.06] p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">Generate details</p>
                  <p className="text-xs text-ink/65">Writes the description, highlights, FAQ, care note and every SEO field from the name, sizes and frame models — built to score 100. Free, no AI service. Read it once before publishing.</p>
                </div>
                {askGenerate ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => generate('empty')} className="h-10 rounded-xl border border-line bg-paper px-3 text-xs font-semibold text-ink hover:bg-field">
                      Fill empty fields only
                    </button>
                    <button type="button" onClick={() => generate('all')} className="h-10 rounded-xl bg-ink px-3 text-xs font-semibold text-paper">
                      Replace everything
                    </button>
                    <button type="button" onClick={() => setAskGenerate(false)} className="h-10 px-2 text-xs text-ink/60">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!s.productType || !(s.title || s.subject).trim()}
                    title={!s.productType ? 'Choose the kind of frame first' : !(s.title || s.subject).trim() ? 'Type the frame name first' : undefined}
                    onClick={() => (hasContent ? setAskGenerate(true) : generate('all'))}
                    className="h-11 rounded-xl bg-gold px-5 text-sm font-bold text-ink shadow-sm hover:bg-gold-deep disabled:opacity-40"
                  >
                    ✦ Generate details
                  </button>
                )}
              </div>
              {sizeLabels.length === 0 && <p className="mt-2 text-2xs text-ink/55">Tip: add sizes and frame models first — the text then names them.</p>}
            </div>
          </Section>

          {/* 3. Design */}
          <Section
            id="design"
            step={3}
            title={s.productType === 'ready_made' ? 'Artwork' : s.productType === 'collage' ? 'Collage design' : 'Photo design'}
            done={s.productType === 'ready_made' ? Boolean(s.artwork) : s.productType === 'collage' ? Boolean(s.collageTemplateId) : s.productType === 'single_photo'}
          >
            {!s.productType && <p className="text-sm text-ink/60">Choose the kind of frame in step 1.</p>}
            {s.productType === 'ready_made' && (
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="space-y-3">
                  <p className="text-xs text-ink/65">Upload the picture in the highest resolution you have. It is printed for every order and cut to each frame&rsquo;s shape from the centre. For a sharp 12×18 print you need about 3600 × 5400 pixels.</p>
                  <input ref={artworkInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadArtwork(e.target.files[0])} />
                  {s.artwork ? (
                    <div className="flex items-center gap-3 rounded-xl border border-line p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.artwork.url.replace(/w=\d+/, 'w=300')} alt="Artwork" className="h-20 w-20 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1 text-xs">
                        <p className="font-semibold text-ink">
                          {s.artwork.widthPx} × {s.artwork.heightPx} pixels
                        </p>
                        <p className="text-ink/60">Sharpness per size is shown in the price list below.</p>
                      </div>
                      <button type="button" disabled={uploading === 'artwork'} onClick={() => artworkInput.current?.click()} className="h-9 rounded-xl border border-line px-3 text-xs font-semibold text-ink hover:bg-field">
                        Replace
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={uploading === 'artwork'}
                      onClick={() => artworkInput.current?.click()}
                      className="flex h-36 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line text-sm font-semibold text-ink/70 hover:border-ink/40 hover:text-ink"
                    >
                      {uploading === 'artwork' ? 'Uploading…' : 'Upload artwork'}
                      <span className="text-2xs font-normal text-ink/50">JPG, PNG or WebP · up to 30 MB</span>
                    </button>
                  )}
                </div>
                {s.artwork && <FramedPreview src={s.artwork.url} look={lookOf(defaultModel)} widthIn={firstPreviewRow?.widthIn ?? 8} heightIn={firstPreviewRow?.heightIn ?? 12} label={`${defaultModel?.name ?? 'Stock frame'}${firstPreviewRow ? ` · ${sizeLabelOf(firstPreviewRow.widthIn, firstPreviewRow.heightIn)}` : ''}`} />}
              </div>
            )}
            {s.productType === 'single_photo' && (
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="space-y-2 text-sm text-ink/75">
                  <p>Nothing to design: the customer&rsquo;s photo fills the whole print. A design is made for each frame shape when you save, and customers see their photo in the frame model they pick.</p>
                  <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-xs">
                    <input type="checkbox" checked={s.allowsTextPersonalization} onChange={(e) => set({ allowsTextPersonalization: e.target.checked })} className="mt-0.5" />
                    <span>
                      <strong className="block text-ink">Customer can add a name or message</strong>
                      For a printed caption, design it as a collage instead (it needs a text space).
                    </span>
                  </label>
                </div>
                <FramedPreview look={lookOf(defaultModel)} widthIn={firstPreviewRow?.widthIn ?? 8} heightIn={firstPreviewRow?.heightIn ?? 12} label="Sample photo" />
              </div>
            )}
            {s.productType === 'collage' && (
              <div className="space-y-3">
                <p className="text-xs text-ink/65">Pick the collage layout made in the collage designer, or design a new one. Upload the designer&rsquo;s artwork there and it finds the photo and text spaces for you.</p>
                <div className="flex flex-wrap gap-2">
                  <select className={`${field} max-w-md`} value={s.collageTemplateId ?? ''} onChange={(e) => set({ collageTemplateId: e.target.value || null })}>
                    <option value="">Choose a collage design…</option>
                    {options.collageTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.publishedVersion ? '' : ' (not published yet)'}
                      </option>
                    ))}
                  </select>
                  <Link href="/admin/personalization-templates" target="_blank" className="h-10 rounded-xl border border-line px-3 text-sm font-semibold leading-10 text-ink hover:bg-field">
                    Design a new collage ↗
                  </Link>
                  <button type="button" onClick={() => void loadOptions()} className="h-10 rounded-xl px-3 text-sm font-semibold text-ink/70 hover:bg-field">
                    Refresh list
                  </button>
                  {s.collageTemplateId && (
                    <Link href={`/admin/personalization-templates/${s.collageTemplateId}`} target="_blank" className="h-10 rounded-xl px-3 text-sm font-semibold leading-10 text-gold-deep hover:bg-field">
                      Edit this design ↗
                    </Link>
                  )}
                </div>
                {s.collageTemplateId && !options.collageTemplates.find((t) => t.id === s.collageTemplateId)?.publishedVersion && (
                  <p className="text-2xs text-amber-700">Publish this design in the collage designer before customers can order.</p>
                )}
              </div>
            )}
          </Section>

          {/* 4. Frame models */}
          <Section id="frames" step={4} title="Frame models" hint="Pick the mouldings this product comes in. The first (★) is what the product page opens with." done={s.frameModelIds.length > 0}>
            {models.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm">
                <p className="font-semibold text-ink">No frame models yet</p>
                <p className="mt-1 text-xs text-ink/60">Add your mouldings once in the frame model library, then come back.</p>
                <Link href="/admin/frame-models" target="_blank" className="mt-3 inline-block rounded-xl bg-ink px-4 py-2 text-xs font-semibold text-paper">
                  Open frame models ↗
                </Link>
                <button type="button" onClick={() => void loadOptions()} className="ml-2 text-xs font-semibold text-ink/70 underline">
                  Refresh
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {models
                    .filter((m) => m.isActive || s.frameModelIds.includes(m.id))
                    .map((m) => {
                      const on = s.frameModelIds.includes(m.id);
                      const isDefault = s.frameModelIds[0] === m.id;
                      return (
                        <div key={m.id} className={`relative rounded-2xl border-2 p-2 transition-colors ${on ? 'border-ink' : 'border-line opacity-80 hover:opacity-100'}`}>
                          <button type="button" aria-pressed={on} onClick={() => toggleModel(m.id)} className="block w-full text-left">
                            <FramedPreview look={lookOf(m)} widthIn={8} heightIn={10} />
                            <span className="mt-1.5 block truncate text-xs font-bold text-ink">{m.name}</span>
                            <span className="block text-2xs text-ink/55">
                              {m.material} · {m.mouldingWidthIn}&Prime;{m.priceDelta ? ` · ${m.priceDelta > 0 ? '+' : '−'}${inr(Math.abs(m.priceDelta))}` : ''}
                            </span>
                          </button>
                          {on && (
                            <button
                              type="button"
                              onClick={() => makeDefault(m.id)}
                              title={isDefault ? 'Default frame' : 'Make default'}
                              className={`absolute right-3 top-3 h-7 w-7 rounded-full text-sm ${isDefault ? 'bg-gold text-ink' : 'bg-paper/90 text-ink/40 hover:text-ink'}`}
                            >
                              ★
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
                <p className="mt-2 text-2xs text-ink/50">
                  <Link href="/admin/frame-models" target="_blank" className="underline">
                    Manage frame models ↗
                  </Link>{' '}
                  ·{' '}
                  <button type="button" onClick={() => void loadOptions()} className="underline">
                    refresh
                  </button>
                </p>
              </>
            )}
          </Section>

          {/* 5. Prices */}
          <Section id="prices" step={5} title="Sizes and prices" hint="Tap the sizes you sell. Each size gets a line per frame model: MRP, your selling price and what it costs you to make." done={activeRows.length > 0 && activeRows.every((r) => r.frameModelId && r.price > 0 && r.mrp >= r.price)}>
            <PricingGrid rows={s.rows} onChange={(rows) => set({ rows })} models={models} selectedModelIds={s.frameModelIds} rates={rates} artwork={s.productType === 'ready_made' ? s.artwork : null} />
          </Section>

          {/* 6. Photos */}
          <Section id="photos" step={6} title="Product photos" hint="Shown on the shop and in Google. The first photo is the main one." done={hasImage}>
            <input ref={galleryInput} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files && void uploadGallery(e.target.files)} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {s.gallery.map((g, i) => (
                <figure key={`${g.url}${i}`} className="space-y-1.5 rounded-xl border border-line p-2">
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-field">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.url.replace(/w=\d+/, 'w=400')} alt={g.alt} className="h-full w-full object-cover" />
                    {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-paper">Main</span>}
                  </div>
                  {g.mediaId ? (
                    <>
                      <input aria-label="Photo description" className="h-8 w-full rounded-lg border border-line px-2 text-2xs" value={g.alt} onChange={(e) => set({ gallery: s.gallery.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) })} placeholder="Describe the photo" />
                      <div className="flex justify-between text-2xs">
                        <span className="flex gap-1">
                          <button type="button" disabled={i === 0} onClick={() => moveGallery(i, -1)} className="rounded px-1.5 hover:bg-field disabled:opacity-30" aria-label="Move left">
                            ←
                          </button>
                          <button type="button" disabled={i === s.gallery.length - 1} onClick={() => moveGallery(i, 1)} className="rounded px-1.5 hover:bg-field disabled:opacity-30" aria-label="Move right">
                            →
                          </button>
                        </span>
                        <button type="button" onClick={() => set({ gallery: s.gallery.filter((_, j) => j !== i) })} className="font-semibold text-alert">
                          Remove
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-2xs text-ink/50">Older photo (kept)</p>
                  )}
                </figure>
              ))}
              <button
                type="button"
                disabled={uploading === 'gallery'}
                onClick={() => galleryInput.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-xs font-semibold text-ink/65 hover:border-ink/40 hover:text-ink"
              >
                {uploading === 'gallery' ? 'Uploading…' : '+ Add photos'}
              </button>
            </div>
            {s.productType === 'ready_made' && s.gallery.length === 0 && s.artwork && <p className="mt-2 text-2xs text-ink/55">No photos added: the artwork itself is used as the product photo.</p>}
          </Section>

          {/* 7. Description */}
          <Section id="content" step={7} title="Description, highlights and FAQ" done={Boolean(s.shortDesc && s.description)}>
            <div className="space-y-4">
              <label className="block">
                <span className={label}>Short description (under the name)</span>
                <textarea rows={2} className={area} value={s.shortDesc} onChange={(e) => set({ shortDesc: e.target.value })} />
              </label>
              <label className="block">
                <span className={label}>Full description</span>
                <textarea rows={10} className={`${area} font-[inherit]`} value={s.description} onChange={(e) => set({ description: e.target.value })} />
                <span className="mt-1 block text-2xs text-ink/50">Blank line = new paragraph · start a line with &ldquo;## &rdquo; for a heading, &ldquo;- &rdquo; for a bullet.</span>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className={label}>Highlights (one per line)</span>
                  <textarea rows={5} className={area} value={s.highlights} onChange={(e) => set({ highlights: e.target.value })} />
                </label>
                <label className="block">
                  <span className={label}>How it works (one step per line)</span>
                  <textarea rows={5} className={area} value={s.howItWorks} onChange={(e) => set({ howItWorks: e.target.value })} />
                </label>
              </div>
              <label className="block">
                <span className={label}>Care</span>
                <input className={field} value={s.careText} onChange={(e) => set({ careText: e.target.value })} />
              </label>
              <div className="space-y-2">
                <span className={label}>Questions customers ask</span>
                {s.faq.map((f, i) => (
                  <div key={i} className="grid gap-2 rounded-xl border border-line p-3 md:grid-cols-[1fr_auto]">
                    <div className="space-y-2">
                      <input className={field} value={f.question} placeholder="Question" onChange={(e) => set({ faq: s.faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) })} />
                      <textarea rows={2} className={area} value={f.answer} placeholder="Answer" onChange={(e) => set({ faq: s.faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)) })} />
                    </div>
                    <button type="button" onClick={() => set({ faq: s.faq.filter((_, j) => j !== i) })} className="self-start text-2xs font-semibold text-alert">
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => set({ faq: [...s.faq, { question: '', answer: '' }] })} className="h-9 rounded-xl border border-line px-3 text-xs font-semibold text-ink hover:bg-field">
                  + Add question
                </button>
              </div>
            </div>
          </Section>

          {/* 8. SEO */}
          <Section id="seo" step={8} title="Google (SEO)" hint="Generate details fills all of this. The score reaches 100 once every check passes." done={seoReport.score === 100}>
            <ProductSeoPanel
              value={s.seo}
              onChange={(next) => set({ seo: { ...s.seo, ...next } })}
              product={{ title: s.title, slug: s.slug, shortDesc: s.shortDesc, descriptionHtml, hasImage }}
              onSlugChange={(slug) => {
                setSlugTouched(true);
                set({ slug });
              }}
              publishStatus={s.status}
            />
          </Section>

          {/* 9. Delivery & publishing */}
          <Section id="publish" step={9} title="Delivery and publishing">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className={label}>Dispatch in (min days)</span>
                <input className={field} inputMode="numeric" value={s.dispatchDaysMin} onChange={(e) => set({ dispatchDaysMin: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} />
              </label>
              <label className="block">
                <span className={label}>to (max days)</span>
                <input className={field} inputMode="numeric" value={s.dispatchDaysMax} onChange={(e) => set({ dispatchDaysMax: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} />
              </label>
              <label className="block">
                <span className={label}>HSN code (GST)</span>
                <input className={field} value={s.hsnCode} onChange={(e) => set({ hsnCode: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) })} placeholder="e.g. 4414" />
              </label>
              <label className="block md:col-span-2">
                <span className={label}>Badges (comma separated)</span>
                <input className={field} value={s.badges} onChange={(e) => set({ badges: e.target.value })} placeholder="Best seller, Ready to hang" />
              </label>
              <label className="block">
                <span className={label}>Status</span>
                <select className={field} value={s.status} onChange={(e) => set({ status: e.target.value as State['status'] })}>
                  <option value="draft">Draft (hidden)</option>
                  <option value="published" disabled={!readyToPublish}>
                    Live on the shop
                  </option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-ink md:col-span-3">
                <input type="checkbox" checked={s.isFeatured} onChange={(e) => set({ isFeatured: e.target.checked })} />
                Feature on the home page
              </label>
            </div>
            {productId && (
              <p className="mt-4 border-t border-line pt-3 text-2xs text-ink/50">
                Advanced:{' '}
                <Link href={`/admin/products/${productId}/variants`} className="underline">
                  raw variant matrix
                </Link>{' '}
                ·{' '}
                <Link href="/admin/inventory" className="underline">
                  stock counts
                </Link>
              </p>
            )}
          </Section>
        </div>

        {/* Summary rail */}
        <aside className="space-y-4 xl:fixed xl:top-24 xl:w-[18rem] xl:right-[calc(2rem+max(0px,(100vw-100rem)/2))]">
          <div className="rounded-2xl border border-line bg-paper p-4">
            <p className="text-2xs font-bold uppercase tracking-wider text-ink/55">Ready to sell?</p>
            <ul className="mt-2 space-y-1.5">
              {checklist.map((c) => (
                <li key={c.text}>
                  <a href={c.href} className="flex items-center gap-2 text-xs hover:underline">
                    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${c.ok ? 'bg-emerald-600 text-white' : 'border border-line text-transparent'}`}>✓</span>
                    <span className={c.ok ? 'text-ink' : 'text-ink/60'}>{c.text}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-paper p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-2xs font-bold uppercase tracking-wider text-ink/55">SEO</p>
              <a href="#seo" className={`font-display text-2xl font-bold tabular-nums ${seoReport.score === 100 ? 'text-emerald-700' : seoReport.score >= 80 ? 'text-amber-700' : 'text-alert'}`}>
                {seoReport.score}
              </a>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-field">
              <div className={`h-full rounded-full ${seoReport.score === 100 ? 'bg-emerald-600' : seoReport.score >= 80 ? 'bg-amber-500' : 'bg-alert'}`} style={{ width: `${seoReport.score}%` }} />
            </div>
            {seoReport.checks.filter((c) => !c.ok).slice(0, 3).map((c) => (
              <p key={c.id} className="mt-1.5 text-2xs text-ink/60">
                • {c.fix}
              </p>
            ))}
          </div>
          <div className="space-y-1 rounded-2xl border border-line bg-paper p-4 text-xs">
            <p className="text-2xs font-bold uppercase tracking-wider text-ink/55">On the shop</p>
            <p className="text-ink">{sizeLabels.length} size{sizeLabels.length === 1 ? '' : 's'} · {s.frameModelIds.length} frame model{s.frameModelIds.length === 1 ? '' : 's'}</p>
            <p className="text-ink">{prices.length ? (Math.min(...prices) === Math.max(...prices) ? inr(prices[0]!) : `${inr(Math.min(...prices))} – ${inr(Math.max(...prices))}`) : 'No prices yet'}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

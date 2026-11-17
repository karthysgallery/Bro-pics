'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { useToast } from '../../../../components/ui/Toast';
import { MediaPickerModal } from '../../../../components/admin/MediaPickerModal';

/**
 * Offers & ads: the homepage offer banner (three pictures, one per screen size), the offer landing page
 * (/offers/flat-50) and Meta (Facebook & Instagram) ad measurement — everything the owner needs to run an ad
 * campaign without a developer.
 */

interface BannerRow {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  tabletImage: string;
  mobileImage: string;
  link: string;
  ctaLabel: string;
  isActive: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
}
type BannerForm = Omit<BannerRow, 'id'> & { id: string | null };
const BLANK_BANNER: BannerForm = {
  id: null,
  title: 'Flat 50% OFF',
  subtitle: 'Make your memories beautiful',
  image: '',
  tabletImage: '',
  mobileImage: '',
  link: '/offers/flat-50',
  ctaLabel: 'Shop the offer',
  isActive: false,
  sortOrder: 0,
  startsAt: null,
  endsAt: null,
};

interface CampaignForm {
  isActive: boolean;
  title: string;
  subtitle: string;
  heroImage: string;
  productId: string;
  sizeLabels: string[];
  ctaLabel: string;
  deliveryNote: string;
  faq: Array<{ question: string; answer: string }>;
  startsAt: string | null;
  endsAt: string | null;
}
const BLANK_CAMPAIGN: CampaignForm = {
  isActive: false,
  title: 'Flat 50% OFF',
  subtitle: 'Make your memories beautiful',
  heroImage: '',
  productId: '',
  sizeLabels: [],
  ctaLabel: 'Shop now',
  deliveryNote: 'Free delivery across Tamil Nadu',
  faq: [],
  startsAt: null,
  endsAt: null,
};

interface MetaForm {
  metaPixelId: string;
  metaEnabled: boolean;
  metaTestEventCode: string;
}

const SLUG = 'flat-50';
const input = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-gold/40';
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(`${v}:00+05:30`).toISOString() : null);

function Card({ title, help, children }: { title: string; help?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-paper p-5 shadow-sm">
      <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
      {help && <div className="mt-1 text-sm text-ink/60">{help}</div>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink">{label}</span>
      {hint && <span className="ml-2 text-xs text-ink/50">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

/** One banner picture with its target size, a preview at that shape, and Choose / Remove. */
function PictureSlot({ label, size, aspect, url, onPick, onClear }: { label: string; size: string; aspect: string; url: string; onPick: () => void; onClear: () => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink">
        {label} <span className="text-xs font-normal text-ink/50">{size}</span>
      </p>
      <div className="overflow-hidden rounded-lg border border-dashed border-line bg-tint" style={{ aspectRatio: aspect }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={`${label} banner preview`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center p-3 text-center text-xs text-ink/50">Not set — the nearest other picture is used</div>}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onPick} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-tint">
          {url ? 'Replace' : 'Choose picture'}
        </button>
        {url && (
          <button type="button" onClick={onClear} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

export default function OffersAdminPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [banner, setBanner] = useState<BannerForm>(BLANK_BANNER);
  const [campaign, setCampaign] = useState<CampaignForm>(BLANK_CAMPAIGN);
  const [meta, setMeta] = useState<MetaForm>({ metaPixelId: '', metaEnabled: false, metaTestEventCode: '' });
  const [products, setProducts] = useState<Array<{ id: string; title: string; status?: string }>>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [picker, setPicker] = useState<null | 'image' | 'tabletImage' | 'mobileImage' | 'heroImage'>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await user!.getIdToken();
      const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? body?.error ?? body?.message ?? 'Something went wrong');
      return body;
    },
    [user]
  );

  const load = useCallback(async () => {
    if (!user) return;
    const [b, c, m, p] = await Promise.all([
      call('/api/admin/banners').catch(() => ({ banners: [] })),
      call(`/api/admin/offer-pages/${SLUG}`).catch(() => ({ campaign: null })),
      call('/api/admin/marketing-settings').catch(() => null),
      call('/api/admin/products').catch(() => ({ products: [] })),
    ]);
    setBanners(b.banners ?? []);
    if (b.banners?.[0]) setBanner({ ...BLANK_BANNER, ...b.banners[0] });
    if (c.campaign) setCampaign({ ...BLANK_CAMPAIGN, ...c.campaign });
    if (m?.settings) setMeta({ metaPixelId: m.settings.metaPixelId ?? '', metaEnabled: Boolean(m.settings.metaEnabled), metaTestEventCode: m.settings.metaTestEventCode ?? '' });
    setProducts((p.products ?? []).filter((x: { status?: string }) => x.status !== 'archived').map((x: { id: string; title: string; status?: string }) => ({ id: x.id, title: x.title, status: x.status })));
  }, [user, call]);

  useEffect(() => {
    load();
  }, [load]);

  // The chosen product's sizes, to pick which are on offer.
  useEffect(() => {
    if (!user || !campaign.productId) return setSizes([]);
    call(`/api/admin/products/${campaign.productId}/variants`)
      .then((r) => setSizes([...new Set<string>((r.variants ?? []).filter((v: { isActive?: boolean }) => v.isActive !== false).map((v: { sizeLabel: string }) => v.sizeLabel))]))
      .catch(() => setSizes([]));
  }, [user, campaign.productId, call]);

  const saveBanner = async () => {
    setSaving('banner');
    try {
      const { id, ...body } = banner;
      if (id) await call(`/api/admin/banners/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await call('/api/admin/banners', { method: 'POST', body: JSON.stringify(body) });
      showToast('Banner saved. The home page updates within a minute.', 'success');
      await load();
    } catch (e) {
      showToast(String((e as Error).message), 'error');
    } finally {
      setSaving(null);
    }
  };

  const saveCampaign = async () => {
    setSaving('campaign');
    try {
      await call(`/api/admin/offer-pages/${SLUG}`, { method: 'PUT', body: JSON.stringify({ ...campaign, faq: campaign.faq.filter((f) => f.question.trim() && f.answer.trim()) }) });
      showToast('Offer page saved.', 'success');
    } catch (e) {
      showToast(String((e as Error).message), 'error');
    } finally {
      setSaving(null);
    }
  };

  const saveMeta = async () => {
    setSaving('meta');
    try {
      await call('/api/admin/marketing-settings', { method: 'PUT', body: JSON.stringify(meta) });
      showToast(meta.metaEnabled ? 'Meta tracking is on.' : 'Meta settings saved (tracking is off).', 'success');
    } catch (e) {
      showToast(String((e as Error).message), 'error');
    } finally {
      setSaving(null);
    }
  };

  const saveBtn = (key: string, onClick: () => void, label = 'Save') => (
    <button type="button" onClick={onClick} disabled={saving !== null} className="rounded-lg bg-ink px-5 py-2 text-sm font-semibold text-paper disabled:opacity-50">
      {saving === key ? 'Saving…' : label}
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Offers &amp; ads</h1>
        <p className="mt-1 text-sm text-ink/60">The home page offer banner, the offer page your ads link to, and Facebook &amp; Instagram ad tracking.</p>
      </div>

      <Card
        title="Home page offer banner"
        help={
          <>
            Upload a separately designed picture for each screen. Keep the bottom-centre clear: the &ldquo;{banner.ctaLabel || 'Shop the offer'}&rdquo; button sits there.
            {banners.length > 1 && <> You have {banners.length} banners; the switched-on one with the lowest priority number is shown.</>}
          </>
        }
      >
        {banners.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {banners.map((b) => (
              <button key={b.id} type="button" onClick={() => setBanner({ ...BLANK_BANNER, ...b })} className={`rounded-full border px-3 py-1 text-xs ${banner.id === b.id ? 'border-ink bg-ink text-paper' : 'border-line text-ink'}`}>
                {b.title || 'Untitled'} {b.isActive ? '· on' : '· off'}
              </button>
            ))}
            <button type="button" onClick={() => setBanner(BLANK_BANNER)} className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-ink">
              + New banner
            </button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <PictureSlot label="Desktop" size="1920 × 720" aspect="8 / 3" url={banner.image} onPick={() => setPicker('image')} onClear={() => setBanner({ ...banner, image: '' })} />
          <PictureSlot label="Tablet" size="1200 × 900" aspect="4 / 3" url={banner.tabletImage} onPick={() => setPicker('tabletImage')} onClear={() => setBanner({ ...banner, tabletImage: '' })} />
          <PictureSlot label="Phone" size="1080 × 1350" aspect="4 / 5" url={banner.mobileImage} onPick={() => setPicker('mobileImage')} onClear={() => setBanner({ ...banner, mobileImage: '' })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" hint="used as the picture's description, and shown when no picture is set">
            <input className={input} value={banner.title} onChange={(e) => setBanner({ ...banner, title: e.target.value })} />
          </Field>
          <Field label="Subtitle">
            <input className={input} value={banner.subtitle} onChange={(e) => setBanner({ ...banner, subtitle: e.target.value })} />
          </Field>
          <Field label="Button text">
            <input className={input} maxLength={40} value={banner.ctaLabel} onChange={(e) => setBanner({ ...banner, ctaLabel: e.target.value })} />
          </Field>
          <Field label="Opens" hint="a page on this site, e.g. /offers/flat-50">
            <input className={input} value={banner.link} onChange={(e) => setBanner({ ...banner, link: e.target.value })} />
          </Field>
          <Field label="Show from" hint="optional">
            <input type="datetime-local" className={input} value={toLocal(banner.startsAt)} onChange={(e) => setBanner({ ...banner, startsAt: fromLocal(e.target.value) })} />
          </Field>
          <Field label="Show until" hint="optional">
            <input type="datetime-local" className={input} value={toLocal(banner.endsAt)} onChange={(e) => setBanner({ ...banner, endsAt: fromLocal(e.target.value) })} />
          </Field>
          <Field label="Priority" hint="lowest number wins when several are on">
            <input type="number" min={0} className={input} value={banner.sortOrder} onChange={(e) => setBanner({ ...banner, sortOrder: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
            <input type="checkbox" checked={banner.isActive} onChange={(e) => setBanner({ ...banner, isActive: e.target.checked })} />
            Show on the home page
          </label>
        </div>
        <div className="flex justify-end">{saveBtn('banner', saveBanner, banner.id ? 'Save banner' : 'Create banner')}</div>
      </Card>

      <Card
        title="Offer page"
        help={
          <>
            The page your ads and the banner open:{' '}
            <a href={`/offers/${SLUG}`} target="_blank" rel="noreferrer" className="underline">
              /offers/{SLUG}
            </a>
            . Prices are always the product&apos;s own size prices (set them in Products), so the page, cart and payment always match.
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Headline">
            <input className={input} value={campaign.title} onChange={(e) => setCampaign({ ...campaign, title: e.target.value })} />
          </Field>
          <Field label="Line under it">
            <input className={input} value={campaign.subtitle} onChange={(e) => setCampaign({ ...campaign, subtitle: e.target.value })} />
          </Field>
          <Field label="Offer product">
            <select className={input} value={campaign.productId} onChange={(e) => setCampaign({ ...campaign, productId: e.target.value, sizeLabels: [] })}>
              <option value="">Choose…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.status === 'draft' ? ' (draft)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Button text">
            <input className={input} maxLength={40} value={campaign.ctaLabel} onChange={(e) => setCampaign({ ...campaign, ctaLabel: e.target.value })} />
          </Field>
          <Field label="Delivery line" hint="shown exactly as written; leave empty to hide">
            <input className={input} value={campaign.deliveryNote} onChange={(e) => setCampaign({ ...campaign, deliveryNote: e.target.value })} />
          </Field>
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">Hero picture <span className="text-xs font-normal text-ink/50">optional — the product photo is used otherwise</span></p>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {campaign.heroImage && <img src={campaign.heroImage} alt="Offer page hero preview" className="h-16 w-16 rounded object-cover" />}
              <button type="button" onClick={() => setPicker('heroImage')} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-tint">
                {campaign.heroImage ? 'Replace' : 'Choose picture'}
              </button>
              {campaign.heroImage && (
                <button type="button" onClick={() => setCampaign({ ...campaign, heroImage: '' })} className="text-xs font-semibold text-red-700">
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
        {sizes.length > 0 && (
          <div>
            <p className="text-sm font-medium text-ink">Sizes on the page <span className="text-xs font-normal text-ink/50">none ticked = all sizes</span></p>
            <div className="mt-2 flex flex-wrap gap-3">
              {sizes.map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={campaign.sizeLabels.includes(s)}
                    onChange={(e) => setCampaign({ ...campaign, sizeLabels: e.target.checked ? [...campaign.sizeLabels, s] : campaign.sizeLabels.filter((x) => x !== s) })}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-ink">Questions &amp; answers <span className="text-xs font-normal text-ink/50">optional</span></p>
          <div className="mt-2 space-y-2">
            {campaign.faq.map((f, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <input className={input} placeholder="Question" value={f.question} onChange={(e) => setCampaign({ ...campaign, faq: campaign.faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) })} />
                <input className={input} placeholder="Answer" value={f.answer} onChange={(e) => setCampaign({ ...campaign, faq: campaign.faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)) })} />
                <button type="button" onClick={() => setCampaign({ ...campaign, faq: campaign.faq.filter((_, j) => j !== i) })} className="text-xs font-semibold text-red-700">
                  Remove
                </button>
              </div>
            ))}
            {campaign.faq.length < 12 && (
              <button type="button" onClick={() => setCampaign({ ...campaign, faq: [...campaign.faq, { question: '', answer: '' }] })} className="text-xs font-semibold text-ink underline">
                + Add a question
              </button>
            )}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Starts" hint="optional">
            <input type="datetime-local" className={input} value={toLocal(campaign.startsAt)} onChange={(e) => setCampaign({ ...campaign, startsAt: fromLocal(e.target.value) })} />
          </Field>
          <Field label="Ends" hint="optional">
            <input type="datetime-local" className={input} value={toLocal(campaign.endsAt)} onChange={(e) => setCampaign({ ...campaign, endsAt: fromLocal(e.target.value) })} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
            <input type="checkbox" checked={campaign.isActive} onChange={(e) => setCampaign({ ...campaign, isActive: e.target.checked })} />
            Offer page is live
          </label>
        </div>
        <div className="flex justify-end">{saveBtn('campaign', saveCampaign, 'Save offer page')}</div>
      </Card>

      <Card
        title="Facebook & Instagram ad tracking (Meta Pixel)"
        help="Lets Meta see which ads lead to product views, carts and paid orders. It only runs for visitors who accept cookies. The secret server key (Conversions API token) is set up separately by your developer and is never shown here."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pixel ID" hint="Events Manager → Data sources → your Pixel">
            <input className={input} inputMode="numeric" placeholder="e.g. 123456789012345" value={meta.metaPixelId} onChange={(e) => setMeta({ ...meta, metaPixelId: e.target.value.replace(/\D/g, '') })} />
          </Field>
          <Field label="Test event code" hint="optional — only while testing in Events Manager">
            <input className={input} placeholder="e.g. TEST12345" value={meta.metaTestEventCode} onChange={(e) => setMeta({ ...meta, metaTestEventCode: e.target.value.trim() })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={meta.metaEnabled} onChange={(e) => setMeta({ ...meta, metaEnabled: e.target.checked })} />
          Tracking on
        </label>
        <div className="flex justify-end">{saveBtn('meta', saveMeta)}</div>
      </Card>

      <MediaPickerModal
        isOpen={picker !== null}
        onClose={() => setPicker(null)}
        allowedTypes={['image']}
        title="Choose a picture"
        onSelect={(asset) => {
          if (picker === 'heroImage') setCampaign((c) => ({ ...c, heroImage: asset.url }));
          else if (picker) setBanner((b) => ({ ...b, [picker]: asset.url }));
          setPicker(null);
        }}
      />
    </div>
  );
}

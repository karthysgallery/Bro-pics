'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { templateDraftFromDetection, type MediaAsset, type PersonalizationTemplate, type Product, type SlotDetectionResult, type Variant } from '@bro-pics/shared';
import { MediaPickerModal } from '../../../components/admin/MediaPickerModal';
import { StatusChip } from '../../../components/admin/StatusChip';
import { useAdminApi } from '../../../components/admin/template-builder/use-admin-api';
import { DETECTION_NOTES_KEY, templateIdFromName } from '../../../components/admin/template-builder/template-draft';

interface TemplateSummary {
  id: string;
  name: string;
  type: string;
  latestVersion: number;
  latestStatus: string;
  publishedVersion: number | null;
  updatedAt: string;
}

interface DetectResponse {
  detection: SlotDetectionResult;
  artwork: { assetId: string; width: number; height: number; hasAlpha: boolean };
  canvas: { width: number; height: number; dpi: number };
  printSizeIn: { width: number; height: number };
  artworkDpi: number;
  warnings: string[];
}

const TYPE_LABEL: Record<string, string> = {
  single_photo: 'Single photo',
  multi_photo: 'Multi-photo',
  collage: 'Collage',
  hero_collage: 'Hero collage',
  calendar: 'Calendar',
  text_plus_photo: 'Photo + text',
  wedding_collage: 'Wedding collage',
  birthday_collage: 'Birthday collage',
};

function NewFromImage({ onCancel }: { onCancel: () => void }) {
  const api = useAdminApi();
  const router = useRouter();
  const [name, setName] = useState('');
  const [image, setImage] = useState<(MediaAsset & { url: string }) | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantId, setVariantId] = useState('');
  const [busy, setBusy] = useState<'detecting' | 'creating' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emptyResult, setEmptyResult] = useState<DetectResponse | null>(null);

  useEffect(() => {
    api<{ products: Product[] }>('/api/admin/products')
      .then((res) => setProducts(res.products ?? []))
      .catch(() => setProducts([]));
  }, [api]);

  useEffect(() => {
    setVariantId('');
    setVariants([]);
    if (!productId) return;
    api<{ variants: Variant[] }>(`/api/admin/products/${productId}/variants`)
      .then((res) => setVariants(res.variants ?? []))
      .catch(() => setVariants([]));
  }, [api, productId]);

  const variant = variants.find((v) => v.id === variantId) ?? null;

  const create = async (result: DetectResponse, withPlaceholderSlot: boolean) => {
    setBusy('creating');
    setError(null);
    try {
      const id = templateIdFromName(name);
      const detection: SlotDetectionResult = withPlaceholderSlot
        ? {
            ...result.detection,
            artworkPlacement: 'below-photos',
            slots: [{ x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotationDeg: 0, shape: 'rect', confidence: 0, source: 'placeholder' }],
          }
        : result.detection;
      const draft: PersonalizationTemplate = templateDraftFromDetection({
        id,
        name: name.trim(),
        artwork: { assetId: result.artwork.assetId },
        canvas: result.canvas,
        detection,
      });
      const created = await api<PersonalizationTemplate>('/api/admin/personalization-templates', { method: 'POST', body: JSON.stringify(draft) });
      try {
        sessionStorage.setItem(
          DETECTION_NOTES_KEY(created.id),
          JSON.stringify({ notes: result.detection.notes, warnings: result.warnings, found: result.detection.slots.length, manual: withPlaceholderSlot })
        );
      } catch {
        // The notes are a convenience.
      }
      router.push(`/admin/personalization-templates/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The template could not be created.');
      setBusy(null);
    }
  };

  const detect = async () => {
    if (!image || !name.trim()) return;
    setBusy('detecting');
    setError(null);
    setEmptyResult(null);
    try {
      const result = await api<DetectResponse>('/api/admin/personalization-templates/detect', {
        method: 'POST',
        body: JSON.stringify({ mediaId: image.id, ...(variant && { widthIn: variant.widthIn, heightIn: variant.heightIn }) }),
      });
      if (result.detection.slots.length === 0) {
        setEmptyResult(result);
        setBusy(null);
        return;
      }
      await create(result, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The image could not be analysed.');
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="new-template" className="space-y-5 rounded-2xl border border-line bg-paper p-5 md:p-6">
      <div className="space-y-1">
        <h2 id="new-template" className="font-display text-lg font-bold text-ink">
          New collage from an image
        </h2>
        <p className="text-xs leading-relaxed text-ink/60">
          Upload the finished collage design. Leave the photo areas transparent, or fill them with plain placeholder boxes or sample photos on a plain
          background. The photo spaces are found automatically, and you can adjust them before publishing.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-ink">Design name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Forever and Always, 12 photos"
              className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-ink"
            />
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-ink">Frame size it prints at (optional)</span>
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Product"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="h-10 rounded-xl border border-line bg-white px-2 text-sm text-ink"
              >
                <option value="">Use the image's own size</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <select
                aria-label="Size"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                disabled={variants.length === 0}
                className="h-10 rounded-xl border border-line bg-white px-2 text-sm text-ink disabled:opacity-50"
              >
                <option value="">Size…</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.sizeLabel} ({v.widthIn}×{v.heightIn} in)
                  </option>
                ))}
              </select>
            </div>
            <p className="text-2xs text-ink/50">Photo quality checks use the size each customer actually buys, so any size of the product can use this design.</p>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-semibold text-ink">Collage image</span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-tint text-xs font-semibold text-ink/70 transition-colors hover:border-ink"
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.url} alt={image.alt || 'Selected collage design'} className="h-full w-full object-contain" />
            ) : (
              'Choose or upload the design'
            )}
          </button>
          {image && (
            <p className="text-2xs text-ink/50">
              {image.width && image.height ? `${image.width} × ${image.height} px · ` : ''}
              <button type="button" className="underline" onClick={() => setPickerOpen(true)}>
                Choose another
              </button>
            </p>
          )}
        </div>
      </div>

      {emptyResult && (
        <div role="status" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {emptyResult.detection.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
          <button
            type="button"
            onClick={() => create(emptyResult, true)}
            disabled={busy !== null}
            className="rounded-lg bg-ink px-3 py-1.5 font-semibold text-paper disabled:opacity-50"
          >
            Create it and draw the spaces by hand
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-xs font-semibold text-ink/70 hover:bg-tint">
          Cancel
        </button>
        <button
          type="button"
          onClick={detect}
          disabled={!image || !name.trim() || busy !== null}
          className="rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-ink shadow-xs transition-colors hover:bg-gold-deep disabled:opacity-50"
        >
          {busy === 'detecting' ? 'Finding photo spaces…' : busy === 'creating' ? 'Creating template…' : 'Find photo spaces'}
        </button>
      </div>

      <MediaPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        allowedTypes={['image']}
        title="Choose the collage design"
        onSelect={(asset) => {
          setImage(asset);
          setPickerOpen(false);
          if (!name.trim() && asset.alt) setName(asset.alt);
        }}
      />
    </section>
  );
}

export default function PersonalizationTemplatesPage() {
  const api = useAdminApi();
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api<{ templates: TemplateSummary[] }>('/api/admin/personalization-templates')
      .then((res) => setTemplates(res.templates))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Templates could not be loaded.');
        setTemplates([]);
      });
  }, [api]);
  useEffect(load, [load]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <div className="flex flex-col justify-between gap-4 border-b border-line pb-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h1 className="font-display text-xl font-bold text-ink md:text-2xl">Personalization templates</h1>
          <p className="text-xs text-ink/60">Photo collages and other designs customers fill with their own photos and text.</p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-ink shadow-xs transition-colors hover:bg-gold-deep"
          >
            New collage from image
          </button>
        )}
      </div>

      {creating && <NewFromImage onCancel={() => setCreating(false)} />}

      {error && (
        <p role="alert" className="text-xs font-medium text-alert">
          {error}
        </p>
      )}

      {templates === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-field" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        !creating && (
          <div className="space-y-3 rounded-2xl border border-line bg-paper p-12 text-center">
            <p className="text-sm font-semibold text-ink">No templates yet</p>
            <p className="text-xs text-ink/60">Upload a collage design and its photo spaces are set up for you.</p>
            <button type="button" onClick={() => setCreating(true)} className="rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-ink">
              New collage from image
            </button>
          </div>
        )
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
          {templates.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/personalization-templates/${t.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-tint">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{t.name}</p>
                  <p className="text-2xs text-ink/55">
                    {TYPE_LABEL[t.type] ?? t.type} · version {t.latestVersion}
                    {t.publishedVersion ? ` · live: v${t.publishedVersion}` : ' · not live yet'}
                  </p>
                </div>
                <StatusChip status={t.latestStatus} size="sm" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

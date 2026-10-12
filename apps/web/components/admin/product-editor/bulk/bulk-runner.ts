import {
  generateProductDetails,
  rowsFromPriceList,
  sizeLabelOf,
  slugify,
  type FrameModel,
  type FramingCostRates,
  type PriceList,
} from '@bro-pics/shared';
import { AdminApiError } from '../../template-builder/use-admin-api';
import type { UploadedImage } from '../use-catalogue-upload';
import type { FrameLook } from '../../../customizer/frame-moulding';
import type { PhotoFrameInfo, ProductPhoto, ProductPhotoInput } from '../product-photos';
import { photoKeyOf } from '../photo-key';
import { checkSizes, codeFromName, orientationFor, uniqueCode, uniqueWith, type Orientation } from './bulk-plan';

export interface BulkDeps {
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  upload: (file: File, options?: { alt?: string; tag?: string }) => Promise<UploadedImage>;
  makePhotos: (input: ProductPhotoInput) => Promise<ProductPhoto[]>;
  lookOf: (model: FrameModel) => FrameLook | null;
  sleep: (ms: number) => Promise<void>;
}

export interface BulkSettings {
  categoryId: string;
  categoryName: string;
  priceList: PriceList;
  models: ReadonlyMap<string, FrameModel>;
  rates: FramingCostRates;
  glitter: { enabled: boolean; extraPrice: number };
  makePhotos: boolean;
  dropSoft: boolean;
  dispatchDaysMin: number;
  dispatchDaysMax: number;
}

/** What one picture needs to become a product, and what has already been done for it (so a retry never repeats it). */
export interface BulkJob {
  id: string;
  file: File;
  /** The name typed (or taken from the file name), already made unique. */
  name: string;
  subject: string;
  orientation: Orientation | 'auto';
  width: number;
  height: number;
  artwork?: UploadedImage;
  gallery?: Array<{ mediaId: string; alt: string; auto: boolean }>;
  autoPhotoKey?: string | null;
  slug?: string;
  productCode?: string;
  /** Set once the shop has the product; the job is never run again. */
  productId?: string;
  /** The save request failed in a way that does not say whether the product was made (e.g. the connection dropped). */
  maybeSaved?: boolean;
}

export interface BulkResult {
  productId: string;
  slug: string;
  title: string;
  warnings: string[];
  skippedSizes: string[];
}

export class BulkJobError extends Error {}

const isBusy = (e: unknown) => (e instanceof AdminApiError && e.status === 429) || (e instanceof Error && /too many requests/i.test(e.message));

/** Runs a request, waiting out the server's rate limit instead of failing the picture. */
export async function withRetry<T>(deps: Pick<BulkDeps, 'sleep'>, fn: () => Promise<T>, onWait?: (seconds: number) => void): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isBusy(e) || attempt >= 5) throw e;
      const seconds = Math.min(60, 15 * (attempt + 1));
      onWait?.(seconds);
      await deps.sleep(seconds * 1000);
    }
  }
}

/** The sizes the shop photos draw, the default frame's sizes first (as the editor does). */
function photoSizes(rows: Array<{ widthIn: number; heightIn: number; frameModelId: string; isActive: boolean }>, defaultModelId: string | undefined) {
  const active = rows.filter((r) => r.isActive);
  const sorted = [...new Map([...active].sort((a, b) => a.widthIn * a.heightIn - b.widthIn * b.heightIn).map((r) => [`${r.widthIn}x${r.heightIn}`, { widthIn: r.widthIn, heightIn: r.heightIn }])).values()];
  const first = sorted.filter((z) => active.some((r) => r.frameModelId === defaultModelId && r.widthIn === z.widthIn && r.heightIn === z.heightIn));
  return [...first, ...sorted.filter((z) => !first.includes(z))];
}

/**
 * Makes one draft ready-made frame from one picture: uploads it, writes the details, draws and uploads the shop
 * photos, then saves the product as a draft with the price list's sizes. Safe to run again on the same job: what
 * is already done (artwork, photos) is kept, and a job that already has a product is returned as it is.
 */
export async function processJob(
  deps: BulkDeps,
  settings: BulkSettings,
  job: BulkJob,
  taken: { slugs: Set<string>; codes: Set<string> },
  update: (patch: Partial<BulkJob>) => void,
  step: (text: string) => void
): Promise<BulkResult> {
  const wait = (s: number) => step(`The server asked us to slow down. Continuing in ${s} seconds…`);

  // The shape decides the sizes, so check that before spending any upload.
  const shape = orientationFor({ width: job.width, height: job.height }, job.orientation);
  const built = rowsFromPriceList(settings.priceList, shape.orientation, settings.models, settings.rates);
  if (built.rows.length === 0) throw new BulkJobError('No size in the chosen price list can be sold: its frame models were removed or switched off.');

  let artwork = job.artwork;
  if (!artwork) {
    step('Uploading the picture…');
    artwork = await withRetry(deps, () => deps.upload(job.file, { alt: `${job.name} artwork`, tag: 'product-artwork' }), wait);
    update({ artwork });
  }
  // The real pixel size the server recorded decides which sizes print sharp.
  const verdict = checkSizes({ width: artwork.width, height: artwork.height }, built.rows, { dropSoft: settings.dropSoft });
  if (verdict.rows.length === 0 || !verdict.rows.some((r) => r.isActive)) {
    throw new BulkJobError(`The picture is too small to print sharp at any size in this price list (${artwork.width} × ${artwork.height} pixels). Use a larger picture.`);
  }
  const rows = verdict.rows;
  const frameModelIds = [...new Set(rows.map((r) => r.frameModelId))];
  const frameModels = frameModelIds.map((id) => settings.models.get(id)).filter((m): m is FrameModel => Boolean(m));
  const sizes = photoSizes(rows, frameModelIds[0]);

  const details = generateProductDetails({
    name: job.name,
    productType: 'ready_made',
    subject: job.subject || job.name,
    categoryName: settings.categoryName,
    sizeLabels: [...new Set(sizes.map((z) => sizeLabelOf(z.widthIn, z.heightIn)))],
    frameModels: frameModels.map((m) => ({ name: m.name, colour: m.colour, material: m.material })),
    dispatchDaysMin: settings.dispatchDaysMin,
    dispatchDaysMax: settings.dispatchDaysMax,
  });

  // A product already saved by an earlier attempt whose answer was lost: adopt it instead of making a twin.
  if (job.maybeSaved && job.slug) {
    const found = await deps
      .api<{ products?: Array<{ id: string; slug: string }> }>(`/api/admin/products?q=${encodeURIComponent(job.slug)}`)
      .then((r) => r.products?.find((p) => p.slug === job.slug))
      .catch(() => undefined);
    if (found) {
      update({ productId: found.id, maybeSaved: false });
      taken.slugs.add(found.slug);
      return { productId: found.id, slug: found.slug, title: details.title, warnings: [], skippedSizes: verdict.tooSoft };
    }
  }

  let slug = job.slug ?? uniqueWith(details.slug || slugify(job.name), taken.slugs);
  const productCode = job.productCode ?? uniqueCode(details.productCode || codeFromName(job.name), taken.codes);
  update({ slug, productCode });

  const glitterExtra = settings.glitter.enabled ? settings.glitter.extraPrice : 0;
  const autoPhotoKey = settings.makePhotos
    ? photoKeyOf({ productType: 'ready_made', title: details.title, pictureSource: artwork.id, models: frameModels, sizes, glitterExtra })
    : null;
  let gallery = job.gallery;
  if (settings.makePhotos && (!gallery || job.autoPhotoKey !== autoPhotoKey)) {
    step('Making the shop photos…');
    const photos = await deps.makePhotos({
      title: details.title,
      pictureUrl: artwork.url.replace(/w=\d+/, 'w=2400'),
      isSample: false,
      frames: frameModels.map<PhotoFrameInfo>((m) => ({ name: m.name, material: m.material, colour: m.colour, colourHex: m.colourHex, mouldingWidthIn: m.mouldingWidthIn, look: deps.lookOf(m) })),
      sizes,
      glitter: settings.glitter.enabled ? { extraPrice: settings.glitter.extraPrice } : null,
    });
    const made: NonNullable<BulkJob['gallery']> = [];
    for (const [i, ph] of photos.entries()) {
      step(`Uploading shop photo ${i + 1} of ${photos.length}…`);
      const blob = await (await fetch(ph.dataUrl)).blob();
      const img = await withRetry(deps, () => deps.upload(new File([blob], `${slugify(details.title) || 'frame'}-${ph.key}.jpg`, { type: 'image/jpeg' }), { alt: ph.alt, tag: 'auto-product-photo' }), wait);
      made.push({ mediaId: img.id, alt: ph.alt, auto: true });
    }
    gallery = made;
    update({ gallery, autoPhotoKey });
  }

  for (let attempt = 0; ; attempt++) {
    step('Saving the draft…');
    const body = buildSetupBody({ job, settings, details, slug, productCode, artworkId: artwork.id, rows, frameModelIds, gallery: gallery ?? [], autoPhotoKey });
    try {
      const result = await withRetry(deps, () => deps.api<{ productId: string; warnings: string[] }>('/api/admin/products/setup', { method: 'POST', body: JSON.stringify(body) }), wait);
      update({ productId: result.productId, maybeSaved: false });
      taken.slugs.add(slug);
      taken.codes.add(productCode);
      return { productId: result.productId, slug, title: details.title, warnings: result.warnings, skippedSizes: verdict.tooSoft };
    } catch (e) {
      // The web address was taken by a product the list did not show: try the next free one.
      if (e instanceof AdminApiError && e.status === 409 && attempt < 5) {
        taken.slugs.add(slug);
        slug = uniqueWith(details.slug || slugify(job.name), taken.slugs);
        update({ slug });
        continue;
      }
      // An answer that never arrived: the product may exist.
      if (!(e instanceof AdminApiError)) update({ maybeSaved: true });
      throw e;
    }
  }
}

export function buildSetupBody(input: {
  job: Pick<BulkJob, 'subject' | 'name'>;
  settings: Pick<BulkSettings, 'categoryId' | 'glitter' | 'dispatchDaysMin' | 'dispatchDaysMax'>;
  details: ReturnType<typeof generateProductDetails>;
  slug: string;
  productCode: string;
  artworkId: string;
  rows: Array<{ widthIn: number; heightIn: number; frameModelId: string; mrp: number; price: number; cost: number; isActive: boolean }>;
  frameModelIds: string[];
  gallery: Array<{ mediaId: string; alt: string; auto: boolean }>;
  autoPhotoKey: string | null;
}) {
  const { details, settings } = input;
  return {
    productType: 'ready_made' as const,
    title: details.title,
    slug: input.slug,
    productCode: input.productCode,
    categoryId: settings.categoryId,
    subject: (input.job.subject || input.job.name).trim(),
    shortDesc: details.shortDesc,
    descriptionHtml: details.descriptionHtml,
    highlights: details.highlights,
    howItWorks: details.howItWorks,
    careText: details.careText,
    faq: details.faq,
    badges: details.badges.slice(0, 5),
    occasionTags: details.occasionTags,
    status: 'draft' as const,
    isFeatured: false,
    allowsTextPersonalization: false,
    dispatchDaysMin: settings.dispatchDaysMin,
    dispatchDaysMax: Math.max(settings.dispatchDaysMin, settings.dispatchDaysMax),
    seo: { title: details.seo.title, description: details.seo.description, focusKeyword: details.seo.focusKeyword, keywords: details.seo.keywords, imageAlt: details.seo.imageAlt, noindex: false },
    frameModelIds: input.frameModelIds,
    rows: input.rows,
    gallery: input.gallery,
    autoPhotoKey: input.autoPhotoKey,
    glitter: settings.glitter,
    artworkMediaId: input.artworkId,
    collageTemplateId: null,
  };
}

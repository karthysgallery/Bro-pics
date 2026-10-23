import { slugify, type FrameModel, type PersonalizationTemplate, type ProductType } from '@bro-pics/shared';
import type { UploadedImage } from '../use-catalogue-upload';
import type { FrameLook } from '../../../customizer/frame-moulding';
import type { PhotoFrameInfo, ProductPhoto, ProductPhotoInput } from '../product-photos';
import { photoKeyOf } from '../photo-key';
import { withRetry } from './bulk-runner';

/**
 * Makes the automatic shop photos (the picture in its frame, sizes, frame close-up, on a wall, the picture) for an
 * existing product and saves it — exactly what opening it in the editor with "Make the shop photos automatically"
 * ticked and pressing Save does, for many products at once. Products imported without the photos show only the bare
 * picture on the shop; this gives them the framed card photo.
 *
 * The product is loaded and saved through the same setup routes the editor uses, so nothing but the photos changes.
 */

export interface RemakeDeps {
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  upload: (file: File, options?: { alt?: string; tag?: string }) => Promise<UploadedImage>;
  makePhotos: (input: ProductPhotoInput) => Promise<ProductPhoto[]>;
  lookOf: (model: FrameModel) => FrameLook | null;
  /** Draws a collage design filled with sample photos; returns an image URL. */
  renderCollage: (design: PersonalizationTemplate, samples: string[]) => Promise<string>;
  latestDesign: (versions: PersonalizationTemplate[]) => PersonalizationTemplate | null;
  samplePhoto: string;
  sleep: (ms: number) => Promise<void>;
}

/** What GET /api/admin/products/{id}/setup returns (only the parts used here). */
export interface LoadedSetup {
  product: {
    productType: ProductType;
    isLegacy: boolean;
    title: string;
    slug: string;
    productCode: string;
    categoryId: string;
    subject: string;
    shortDesc: string;
    descriptionHtml: string;
    highlights: string[];
    howItWorks: string[];
    careText: string;
    faq: Array<{ question: string; answer: string }>;
    badges: string[];
    occasionTags: string[];
    status: 'draft' | 'published' | 'archived';
    isFeatured: boolean;
    allowsTextPersonalization: boolean;
    dispatchDaysMin: number;
    dispatchDaysMax: number;
    hsnCode: string;
    seo: { title: string; description: string; focusKeyword: string; keywords: string[]; imageAlt: string; noindex: boolean };
    frameModelIds: string[];
    artwork: { mediaId: string; url: string } | null;
    autoPhotoKey: string | null;
    glitter: { enabled: boolean; extraPrice: number };
    samplePhotos: string[];
    collageTemplateId: string | null;
  };
  rows: Array<{ variantId?: string; widthIn: number; heightIn: number; frameModelId: string | null; legacyFinish?: string | null; mrp: number; price: number; cost: number; isActive: boolean }>;
  gallery: Array<{ mediaId: string | null; url: string; alt: string; auto: boolean }>;
}

export type RemakeOutcome = { status: 'made'; photos: number } | { status: 'up-to-date' } | { status: 'skipped'; reason: string };

/** Sizes in the order the photos draw them: the default frame's sizes first (the editor's order). */
export function orderedPhotoSizes(rows: LoadedSetup['rows'], defaultModelId: string | undefined) {
  const active = rows.filter((r) => r.isActive);
  const sorted = [...new Map([...active].sort((a, b) => a.widthIn * a.heightIn - b.widthIn * b.heightIn).map((r) => [`${r.widthIn}x${r.heightIn}`, { widthIn: r.widthIn, heightIn: r.heightIn }])).values()];
  const first = sorted.filter((z) => active.some((r) => r.frameModelId === defaultModelId && r.widthIn === z.widthIn && r.heightIn === z.heightIn));
  return [...first, ...sorted.filter((z) => !first.includes(z))];
}

/** The same "what the photos are drawn from" source the editor uses, so the editor sees them as up to date. */
export function pictureSourceOf(p: LoadedSetup['product']): string | null {
  if (p.productType === 'ready_made') return p.artwork?.mediaId ?? null;
  if (p.productType === 'collage') return p.collageTemplateId ? `${p.collageTemplateId}|${p.samplePhotos.join(',') || 'sample'}` : null;
  return p.samplePhotos.join(',') || 'sample';
}

export async function remakeShopPhotos(
  deps: RemakeDeps,
  productId: string,
  models: ReadonlyMap<string, FrameModel>,
  step: (text: string) => void,
  options: { force?: boolean } = {}
): Promise<RemakeOutcome> {
  const wait = (s: number) => step(`The server asked us to slow down. Continuing in ${s} seconds…`);
  const setup = await withRetry(deps, () => deps.api<LoadedSetup>(`/api/admin/products/${encodeURIComponent(productId)}/setup`), wait);
  const p = setup.product;

  if (p.isLegacy || setup.rows.some((r) => !r.frameModelId)) return { status: 'skipped', reason: 'An older product: open it once in the editor and choose its frame models.' };
  const frameModels = p.frameModelIds.map((id) => models.get(id)).filter((m): m is FrameModel => Boolean(m));
  if (frameModels.length === 0) return { status: 'skipped', reason: 'Its frame models were removed.' };
  const sizes = orderedPhotoSizes(setup.rows, p.frameModelIds[0]);
  if (sizes.length === 0) return { status: 'skipped', reason: 'No size is switched on.' };
  const pictureSource = pictureSourceOf(p);
  if (!pictureSource) return { status: 'skipped', reason: p.productType === 'collage' ? 'No collage design chosen.' : 'No artwork uploaded.' };

  const glitterExtra = p.glitter.enabled ? p.glitter.extraPrice : 0;
  const key = photoKeyOf({ productType: p.productType, title: p.title, pictureSource, models: frameModels, sizes, glitterExtra });
  if (!options.force && p.autoPhotoKey === key && setup.gallery.some((g) => g.auto)) return { status: 'up-to-date' };

  step('Drawing the picture…');
  let pictureUrl: string;
  if (p.productType === 'ready_made') pictureUrl = p.artwork!.url.replace(/w=\d+/, 'w=2400');
  else if (p.productType === 'collage') {
    const r = await withRetry(deps, () => deps.api<{ versions: PersonalizationTemplate[] }>(`/api/admin/personalization-templates/${encodeURIComponent(p.collageTemplateId!)}`), wait);
    const design = deps.latestDesign(r.versions);
    if (!design) return { status: 'skipped', reason: 'The collage design could not be found.' };
    pictureUrl = await deps.renderCollage(design, p.samplePhotos.length ? p.samplePhotos : [deps.samplePhoto]);
  } else pictureUrl = p.samplePhotos[0] ?? deps.samplePhoto;

  step('Making the shop photos…');
  const photos = await deps.makePhotos({
    title: p.title,
    pictureUrl,
    isSample: p.productType !== 'ready_made',
    frames: frameModels.map<PhotoFrameInfo>((m) => ({ name: m.name, material: m.material, colour: m.colour, colourHex: m.colourHex, mouldingWidthIn: m.mouldingWidthIn, look: deps.lookOf(m) })),
    sizes,
    glitter: p.glitter.enabled ? { extraPrice: p.glitter.extraPrice } : null,
  });
  const made: Array<{ mediaId: string; alt: string; auto: boolean }> = [];
  for (const [i, ph] of photos.entries()) {
    step(`Uploading shop photo ${i + 1} of ${photos.length}…`);
    const blob = await (await fetch(ph.dataUrl)).blob();
    const img = await withRetry(deps, () => deps.upload(new File([blob], `${slugify(p.title) || 'frame'}-${ph.key}.jpg`, { type: 'image/jpeg' }), { alt: ph.alt, tag: 'auto-product-photo' }), wait);
    made.push({ mediaId: img.id, alt: ph.alt, auto: true });
  }

  // The new photos first (the first is the shop card), then the owner's own photos as they were.
  const own = setup.gallery.filter((g): g is typeof g & { mediaId: string } => !g.auto && Boolean(g.mediaId)).map((g) => ({ mediaId: g.mediaId, alt: g.alt, auto: false }));
  const body = {
    productType: p.productType,
    title: p.title,
    slug: p.slug,
    productCode: p.productCode,
    categoryId: p.categoryId,
    subject: p.subject,
    shortDesc: p.shortDesc,
    descriptionHtml: p.descriptionHtml,
    highlights: p.highlights,
    howItWorks: p.howItWorks,
    careText: p.careText,
    faq: p.faq,
    badges: p.badges.slice(0, 5),
    occasionTags: p.occasionTags,
    status: p.status,
    isFeatured: p.isFeatured,
    allowsTextPersonalization: p.allowsTextPersonalization,
    dispatchDaysMin: p.dispatchDaysMin,
    dispatchDaysMax: Math.max(p.dispatchDaysMin, p.dispatchDaysMax),
    ...(p.hsnCode.trim() && { hsnCode: p.hsnCode.trim() }),
    seo: p.seo,
    frameModelIds: p.frameModelIds,
    rows: setup.rows.map(({ legacyFinish: _l, ...r }) => ({ ...r, frameModelId: r.frameModelId! })),
    gallery: [...made, ...own],
    autoPhotoKey: key,
    glitter: p.glitter,
    samplePhotos: p.productType === 'ready_made' ? [] : p.samplePhotos,
    artworkMediaId: p.productType === 'ready_made' ? (p.artwork?.mediaId ?? null) : null,
    collageTemplateId: p.productType === 'collage' ? p.collageTemplateId : null,
  };
  step('Saving…');
  await withRetry(deps, () => deps.api(`/api/admin/products/${encodeURIComponent(productId)}/setup`, { method: 'PUT', body: JSON.stringify(body) }), wait);
  return { status: 'made', photos: made.length };
}

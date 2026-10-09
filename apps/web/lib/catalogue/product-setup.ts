import 'server-only';
import { z } from 'zod';
import type { Firestore } from 'firebase-admin/firestore';
import {
  PriceRowSchema,
  ProductSchema,
  buildProductSearchFields,
  buildReadyMadeTemplate,
  buildSinglePhotoTemplate,
  centreCrop,
  checkPriceRows,
  designId,
  groupSizesByShape,
  shapeKey,
  variantFromRow,
  type FrameModel,
  type PersonalizationTemplate,
  type Product,
  type Variant,
} from '@bro-pics/shared';
import { FRAME_MODELS } from './frame-models';
import { createDraft, getLatestPublished, transitionStatus } from '../personalization-templates';
import { buildAssetExists } from '../personalization-template-http';

/**
 * The guided product editor's save: ONE request writes everything a frame
 * needs to be sold —
 *   - the product (details, SEO, kind of frame, frame models offered);
 *   - one variant per size × frame model (MRP, selling price) and its private
 *     making cost (variantCosts/{variantId});
 *   - the gallery photos (products/{id}/media);
 *   - for ready-made and single-photo frames, the print design itself
 *     (a published personalization template per print shape), so the owner
 *     never needs the template builder for them. Collages link the design
 *     made in the template builder.
 * Sizes removed from the grid are switched off, never deleted: past orders
 * keep pointing at them.
 */

const seo = z
  .object({
    title: z.string().trim().max(120).default(''),
    description: z.string().trim().max(320).default(''),
    focusKeyword: z.string().trim().max(80).default(''),
    keywords: z.array(z.string().trim().min(1).max(80)).max(15).default([]),
    imageAlt: z.string().trim().max(160).default(''),
    noindex: z.boolean().default(false),
  })
  .strict();

export const ProductSetupBodySchema = z
  .object({
    productType: z.enum(['ready_made', 'single_photo', 'collage']),
    title: z.string().trim().min(3, 'Enter the frame name.').max(120),
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'The web address may use only small letters, numbers and dashes.').max(100),
    productCode: z.string().trim().regex(/^[A-Za-z0-9]{1,12}$/, 'Product code: up to 12 letters or numbers.'),
    categoryId: z.string().min(1, 'Choose a category.'),
    subject: z.string().trim().max(80).default(''),
    shortDesc: z.string().trim().max(400).default(''),
    descriptionHtml: z.string().max(20000).default(''),
    highlights: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
    howItWorks: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
    careText: z.string().trim().max(600).default(''),
    faq: z.array(z.object({ question: z.string().trim().min(1).max(200), answer: z.string().trim().min(1).max(1000) }).strict()).max(15).default([]),
    badges: z.array(z.string().trim().min(1).max(30)).max(5).default([]),
    occasionTags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
    status: z.enum(['draft', 'published', 'archived']),
    isFeatured: z.boolean().default(false),
    allowsTextPersonalization: z.boolean().default(false),
    dispatchDaysMin: z.number().int().min(0).max(60),
    dispatchDaysMax: z.number().int().min(0).max(60),
    hsnCode: z.string().trim().max(10).optional(),
    seo,
    /** First = the default frame the product page opens with. */
    frameModelIds: z.array(z.string().min(1)).min(1, 'Choose at least one frame model.').max(12),
    rows: z.array(PriceRowSchema).min(1, 'Add at least one size.').max(120),
    gallery: z.array(z.object({ mediaId: z.string().min(1), alt: z.string().trim().max(160).default('') }).strict()).max(20).default([]),
    /** Ready-made: the high-resolution artwork (media library id). */
    artworkMediaId: z.string().min(1).nullable().default(null),
    /** Collage: the design made in the template builder. */
    collageTemplateId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).nullable().default(null),
  })
  .strict()
  .refine((b) => b.dispatchDaysMax >= b.dispatchDaysMin, { message: 'Maximum dispatch days must be at least the minimum.', path: ['dispatchDaysMax'] })
  .refine((b) => b.productType !== 'ready_made' || b.artworkMediaId, { message: 'Upload the artwork for a ready-made frame.', path: ['artworkMediaId'] })
  .refine((b) => b.productType !== 'collage' || b.collageTemplateId, { message: 'Choose or design the collage layout.', path: ['collageTemplateId'] })
  .refine((b) => b.rows.every((r) => b.frameModelIds.includes(r.frameModelId)), { message: 'A size uses a frame model that is not selected.', path: ['rows'] });
export type ProductSetupBody = z.infer<typeof ProductSetupBodySchema>;

export class SetupError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 422,
    message: string
  ) {
    super(message);
  }
}

interface MediaDoc {
  id: string;
  path: string;
  type: string;
  width?: number;
  height?: number;
  alt?: string;
}

/** Storage work, behind an interface so the save can be tested without a bucket. */
export interface ArtworkStore {
  /** Cuts `crop` out of the image at `sourcePath` and saves it (JPEG) at `destPath`. */
  cropTo(sourcePath: string, crop: { left: number; top: number; width: number; height: number }, destPath: string): Promise<{ widthPx: number; heightPx: number; sizeBytes: number }>;
}

/** Image URL the shop shows a media-library picture from (served by /api/media/{id}/image). */
export const mediaImageUrl = (mediaId: string, width = 1600) => `/api/media/${encodeURIComponent(mediaId)}/image?w=${width}`;

/** Firestore refuses `undefined`; drop those keys (Dates and arrays are kept as they are). */
function withoutUndefined<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) ? withoutUndefined(v as object) : v;
  }
  return out as T;
}

function sameDesign(a: PersonalizationTemplate, b: PersonalizationTemplate): boolean {
  const key = (t: PersonalizationTemplate) => JSON.stringify({ c: t.canvas, p: t.photoSlots, l: t.layers.map((l) => (l.kind === 'fixed' ? [l.kind, l.asset.assetId, l.printed] : [l.kind, l.slotId])), n: t.name });
  return key(a) === key(b);
}

/** Publishes an auto-made design, or reuses the published one when nothing changed (so orders keep the same version). */
export async function publishAutoDesign(db: Firestore, template: PersonalizationTemplate, now: Date): Promise<PersonalizationTemplate> {
  const latest = await getLatestPublished(db, template.id);
  if (latest && sameDesign(latest, template)) return latest;
  const draft = await createDraft(db, template, now);
  const assetExists = await buildAssetExists(db, draft);
  await transitionStatus(db, draft.id, draft.version, 'review', { now });
  return transitionStatus(db, draft.id, draft.version, 'published', { now, validate: { assetExists } });
}

export interface SetupResult {
  productId: string;
  slug: string;
  warnings: string[];
  variants: number;
}

export async function saveProductSetup(db: Firestore, store: ArtworkStore, productId: string | null, body: ProductSetupBody, now = new Date()): Promise<SetupResult> {
  const warnings: string[] = [];
  const problems = checkPriceRows(body.rows);
  const firstError = problems.find((p) => p.severity === 'error');
  if (firstError) throw new SetupError(400, firstError.index >= 0 ? `Row ${firstError.index + 1}: ${firstError.message}` : firstError.message);
  for (const p of problems) if (p.severity === 'warning') warnings.push(`Row ${p.index + 1}: ${p.message}`);

  // --- reads -------------------------------------------------------------------------------------
  const productsRef = db.collection('products');
  const ref = productId ? productsRef.doc(productId) : productsRef.doc();
  const id = ref.id;
  const [current, slugTaken, category, modelSnaps] = await Promise.all([
    productId ? ref.get() : Promise.resolve(null),
    productsRef.where('slug', '==', body.slug).limit(2).get(),
    db.collection('categories').doc(body.categoryId).get(),
    db.getAll(...body.frameModelIds.map((m) => db.collection(FRAME_MODELS).doc(m))),
  ]);
  if (productId && !current?.exists) throw new SetupError(404, 'This product no longer exists.');
  if (slugTaken.docs.some((d) => d.id !== id)) throw new SetupError(409, `Another product already uses the web address /product/${body.slug}. Change the address.`);
  if (!category.exists) throw new SetupError(400, 'The chosen category no longer exists.');
  const models = new Map<string, FrameModel>();
  for (const s of modelSnaps) {
    if (!s.exists) throw new SetupError(400, `Frame model "${s.id}" no longer exists.`);
    const m = s.data() as FrameModel;
    if (!m.isActive) warnings.push(`Frame model ${m.name} is switched off in the frame model library.`);
    models.set(s.id, m);
  }
  const mediaIds = [...new Set([...body.gallery.map((g) => g.mediaId), ...(body.artworkMediaId ? [body.artworkMediaId] : [])])];
  const mediaSnaps = mediaIds.length ? await db.getAll(...mediaIds.map((m) => db.collection('media').doc(m))) : [];
  const media = new Map<string, MediaDoc>();
  for (const s of mediaSnaps) {
    if (!s.exists) throw new SetupError(400, 'A chosen picture is no longer in the media library. Upload it again.');
    media.set(s.id, { id: s.id, ...(s.data() as Omit<MediaDoc, 'id'>) });
  }
  const before = current?.exists ? (current.data() as Product & { slugHistory?: string[] }) : null;
  const existingVariants = new Map((await ref.collection('variants').get()).docs.map((d) => [d.id, d.data() as Variant]));

  // --- the print design(s) --------------------------------------------------------------------
  const activeRows = body.rows.filter((r) => r.isActive);
  const shapes = groupSizesByShape(activeRows.length ? activeRows : body.rows);
  const designByShape = new Map<string, string | null>();
  let photoSlots = 1;
  let artwork: Product['artwork'] = null;

  if (body.productType === 'ready_made') {
    const art = media.get(body.artworkMediaId!)!;
    if (!art.width || !art.height) throw new SetupError(422, 'The artwork has no recorded size. Upload it again.');
    artwork = { mediaId: art.id, url: mediaImageUrl(art.id), widthPx: art.width, heightPx: art.height };
    photoSlots = 0;
    for (const shape of shapes) {
      const crop = centreCrop({ width: art.width, height: art.height }, shape.largest);
      const kept = (crop.width * crop.height) / (art.width * art.height);
      if (kept < 0.85) warnings.push(`${shape.largest.widthIn}x${shape.largest.heightIn}: the artwork is a different shape, so ${Math.round((1 - kept) * 100)}% is trimmed from the edges.`);
      const dpi = Math.floor(Math.min(crop.width / shape.largest.widthIn, crop.height / shape.largest.heightIn));
      if (dpi < 150) warnings.push(`${shape.largest.widthIn}x${shape.largest.heightIn}: the artwork is only ${dpi} pixels per inch at this size and will print soft. Upload a larger file or drop this size.`);
      // One cropped copy per shape, stored in the media library so the print service can load it.
      const cutId = `art_${id}_${shapeKey(shape.largest).replace('.', '_')}`.toLowerCase();
      const cutSnap = await db.collection('media').doc(cutId).get();
      const cutFrom = cutSnap.exists ? (cutSnap.data() as { sourceMediaId?: string }).sourceMediaId : null;
      if (!cutSnap.exists || cutFrom !== art.id) {
        const destPath = `public/products/${id}/artwork-${shapeKey(shape.largest).replace('.', '_')}-${art.id}.jpg`;
        const saved = await store.cropTo(art.path, crop, destPath);
        await db.collection('media').doc(cutId).set({
          id: cutId, path: destPath, type: 'image', width: saved.widthPx, height: saved.heightPx, sizeBytes: saved.sizeBytes,
          alt: `${body.title} artwork`, tags: ['product-artwork'], usageRefs: [{ resource: 'product', resourceId: id }],
          isActive: true, sourceMediaId: art.id, createdAt: now, updatedAt: now,
        });
      }
      const template = buildReadyMadeTemplate({ productId: id, name: `${body.title} (${shape.largest.widthIn}x${shape.largest.heightIn} shape)`, size: shape.largest, artwork: { assetId: cutId, url: mediaImageUrl(cutId, 2400) } });
      const published = await publishAutoDesign(db, template, now);
      designByShape.set(shape.key, published.id);
    }
  } else if (body.productType === 'single_photo') {
    for (const shape of shapes) {
      const template = buildSinglePhotoTemplate({ productId: id, name: `${body.title} (${shape.largest.widthIn}x${shape.largest.heightIn} shape)`, size: shape.largest });
      const published = await publishAutoDesign(db, template, now);
      designByShape.set(shape.key, published.id);
    }
  } else {
    const collage = await getLatestPublished(db, body.collageTemplateId!);
    if (!collage) {
      warnings.push('The collage design is not published yet, so customers cannot order this frame. Publish it in the collage designer.');
      const summary = await db.collection('personalizationTemplates').doc(body.collageTemplateId!).get();
      if (!summary.exists) throw new SetupError(400, 'The chosen collage design does not exist.');
      const latest = (await db.collection('personalizationTemplates').doc(body.collageTemplateId!).collection('versions').doc(String(summary.get('latestVersion'))).get()).data() as { photoSlots?: unknown[] } | undefined;
      photoSlots = Math.max(1, latest?.photoSlots?.length ?? 1);
    } else {
      photoSlots = Math.max(1, collage.photoSlots.length);
      const designRatio = collage.canvas.width / collage.canvas.height;
      for (const r of activeRows) {
        if (Math.abs(r.widthIn / r.heightIn - designRatio) / designRatio > 0.02) {
          warnings.push(`${r.widthIn}x${r.heightIn}: this size is a different shape from the collage design (${collage.canvas.width}x${collage.canvas.height}); the print will be stretched. Use sizes of the same shape.`);
          break;
        }
      }
    }
    for (const shape of shapes) designByShape.set(shape.key, null); // variants follow the product's collage design
  }

  // --- variants + private costs ---------------------------------------------------------------
  const batch = db.batch();
  const seen = new Set<string>();
  for (const row of body.rows) {
    const model = models.get(row.frameModelId)!;
    const design = designByShape.get(shapeKey(row)) ?? (body.productType === 'collage' ? null : designId(id, row));
    const v = variantFromRow(id, body.productCode, row, model, design);
    const old = existingVariants.get(v.id);
    // Keep the shop's stock settings (Inventory page) across edits.
    const doc: Variant = { ...v, ...(old && { stockStatus: old.stockStatus, ...(old.trackStock !== undefined && { trackStock: old.trackStock }), ...(old.stockQty !== undefined && { stockQty: old.stockQty }) }) };
    batch.set(ref.collection('variants').doc(v.id), withoutUndefined(doc));
    batch.set(db.collection('variantCosts').doc(v.id), { productId: id, variantId: v.id, cost: row.cost, updatedAt: now.toISOString() });
    seen.add(v.id);
  }
  for (const [vid, v] of existingVariants) if (!seen.has(vid) && v.isActive) batch.update(ref.collection('variants').doc(vid), { isActive: false });

  // --- gallery --------------------------------------------------------------------------------
  const gallery = body.gallery.length ? body.gallery : body.artworkMediaId ? [{ mediaId: body.artworkMediaId, alt: body.seo.imageAlt || body.title }] : [];
  const oldMedia = await ref.collection('media').get();
  const keep = new Set(gallery.map((g) => `g_${g.mediaId}`));
  for (const d of oldMedia.docs) if (!keep.has(d.id) && d.id.startsWith('g_')) batch.delete(d.ref);
  gallery.forEach((g, i) => {
    batch.set(ref.collection('media').doc(`g_${g.mediaId}`), { id: `g_${g.mediaId}`, productId: id, variantId: null, type: 'image', url: mediaImageUrl(g.mediaId), alt: g.alt || body.seo.imageAlt || body.title, sortOrder: i });
  });
  // Legacy (seeded) gallery docs stay as they are; the card images come from the new gallery when it has any.
  const legacyImages = oldMedia.docs.filter((d) => !d.id.startsWith('g_') && d.get('variantId') === null && d.get('type') === 'image').sort((a, b) => a.get('sortOrder') - b.get('sortOrder')).map((d) => String(d.get('url')));
  const cardImages = [...gallery.map((g) => mediaImageUrl(g.mediaId)), ...legacyImages];

  // --- the product ----------------------------------------------------------------------------
  // The product's own design is the one of the size the page opens with (default frame model, first size).
  const defaultRow = activeRows.find((r) => r.frameModelId === body.frameModelIds[0]) ?? activeRows[0] ?? body.rows[0]!;
  const productTemplateId = body.productType === 'collage' ? body.collageTemplateId : (designByShape.get(shapeKey(defaultRow)) ?? null);
  const fields = {
    title: body.title,
    slug: body.slug,
    categoryId: body.categoryId,
    shortDesc: body.shortDesc,
    descriptionHtml: body.descriptionHtml,
    highlights: body.highlights,
    howItWorks: body.howItWorks,
    careText: body.careText,
    faq: body.faq,
    badges: body.badges,
    occasionTags: body.occasionTags,
    status: body.status,
    isActive: body.status === 'published',
    isFeatured: body.isFeatured,
    allowsTextPersonalization: body.productType === 'ready_made' ? false : body.allowsTextPersonalization,
    dispatchDaysMin: body.dispatchDaysMin,
    dispatchDaysMax: body.dispatchDaysMax,
    ...(body.hsnCode ? { hsnCode: body.hsnCode } : {}),
    seo: Object.fromEntries(Object.entries(body.seo).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== '' && v !== false))),
    productType: body.productType,
    productCode: body.productCode.toUpperCase(),
    subject: body.subject,
    frameModelIds: body.frameModelIds,
    artwork,
    photoSlots,
    personalizationTemplateId: productTemplateId,
    basePrice: Math.min(...(activeRows.length ? activeRows : body.rows).map((r) => r.price)),
    primaryImageUrl: cardImages[0] ?? before?.primaryImageUrl ?? '',
    hoverImageUrl: cardImages[1] ?? null,
    ...buildProductSearchFields(body.title, body.shortDesc, body.seo.keywords),
    updatedAt: now,
  };
  if (before) {
    const update: Record<string, unknown> = { ...fields };
    if (before.slug !== body.slug) update.slugHistory = [...new Set([...(before.slugHistory ?? []), before.slug])].filter((s) => s !== body.slug);
    batch.update(ref, withoutUndefined(update));
  } else {
    const product = ProductSchema.parse({
      id,
      ...fields,
      createdAt: now,
      availableSizes: [],
      availableColours: [],
      availableMaterials: [],
      minPrice: 0,
      maxPrice: 0,
      inStock: false,
      ratingAverage: 0,
      ratingCount: 0,
    });
    batch.set(ref, withoutUndefined(product));
  }
  await batch.commit();

  if (cardImages.length === 0) warnings.push('Add at least one product photo: it shows on the shop and in Google.');
  return { productId: id, slug: body.slug, warnings, variants: body.rows.length };
}

/** Everything the guided editor shows for an existing product, in the shape it saves. */
export async function loadProductSetup(db: Firestore, productId: string) {
  const ref = db.collection('products').doc(productId);
  const snap = await ref.get();
  if (!snap.exists) throw new SetupError(404, 'This product no longer exists.');
  const p = snap.data() as Product & { slugHistory?: string[] };
  const [variantSnap, mediaSnap, models] = await Promise.all([
    ref.collection('variants').get(),
    ref.collection('media').orderBy('sortOrder', 'asc').get(),
    db.collection(FRAME_MODELS).get(),
  ]);
  const variants = variantSnap.docs.map((d) => d.data() as Variant);
  const costSnaps = variants.length ? await db.getAll(...variants.map((v) => db.collection('variantCosts').doc(v.id))) : [];
  const cost = new Map(costSnaps.filter((c) => c.exists).map((c) => [c.id, Number(c.get('cost')) || 0]));
  const modelList = models.docs.map((d) => d.data() as FrameModel);
  // Sizes made before frame models existed: matched to a model by name or colour, so converting keeps them.
  const matchModel = (v: Variant) =>
    v.frameModelId ??
    modelList.find((m) => m.name.toLowerCase() === v.frameColour.toLowerCase())?.id ??
    modelList.find((m) => m.colour.toLowerCase() === v.frameColour.toLowerCase())?.id ??
    null;
  const rows = variants
    .map((v) => ({
      variantId: v.id,
      widthIn: v.widthIn,
      heightIn: v.heightIn,
      frameModelId: matchModel(v),
      legacyFinish: v.frameModelId ? null : v.frameColour || null,
      mrp: v.compareAtPrice ?? v.price,
      price: v.price,
      cost: cost.get(v.id) ?? 0,
      isActive: v.isActive,
    }))
    .sort((a, b) => a.widthIn * a.heightIn - b.widthIn * b.heightIn || String(a.frameModelId).localeCompare(String(b.frameModelId)));
  const productType: ProductSetupBody['productType'] = p.productType ?? (p.personalizationTemplateId || p.photoSlots > 1 ? 'collage' : 'single_photo');
  const frameModelIds = p.frameModelIds?.length ? p.frameModelIds : [...new Set(rows.map((r) => r.frameModelId).filter((m): m is string => Boolean(m)))];
  const gallery = mediaSnap.docs
    .filter((d) => d.get('variantId') === null && d.get('type') === 'image')
    .map((d) => {
      const url = String(d.get('url'));
      const fromLibrary = /^\/api\/media\/([^/]+)\/image/.exec(url);
      return { mediaId: fromLibrary ? decodeURIComponent(fromLibrary[1]!) : null, url, alt: String(d.get('alt') ?? '') };
    });
  return {
    product: {
      id: productId,
      productType,
      isLegacy: !p.productType,
      title: p.title,
      slug: p.slug,
      productCode: p.productCode ?? p.slug.replace(/[^a-z0-9]/gi, '').slice(0, 12).toUpperCase(),
      categoryId: p.categoryId,
      subject: p.subject ?? '',
      shortDesc: p.shortDesc ?? '',
      descriptionHtml: p.descriptionHtml ?? '',
      highlights: p.highlights ?? [],
      howItWorks: p.howItWorks ?? [],
      careText: p.careText ?? '',
      faq: p.faq ?? [],
      badges: p.badges ?? [],
      occasionTags: p.occasionTags ?? [],
      status: p.status ?? (p.isActive ? 'published' : 'draft'),
      isFeatured: Boolean(p.isFeatured),
      allowsTextPersonalization: Boolean(p.allowsTextPersonalization),
      dispatchDaysMin: p.dispatchDaysMin ?? 2,
      dispatchDaysMax: p.dispatchDaysMax ?? 4,
      hsnCode: p.hsnCode ?? '',
      seo: {
        title: p.seo?.title ?? '',
        description: p.seo?.description ?? '',
        focusKeyword: p.seo?.focusKeyword ?? '',
        keywords: p.seo?.keywords ?? [],
        imageAlt: p.seo?.imageAlt ?? '',
        noindex: Boolean(p.seo?.noindex),
      },
      frameModelIds,
      artwork: p.artwork ?? null,
      collageTemplateId: productType === 'collage' ? (p.personalizationTemplateId ?? null) : null,
      primaryImageUrl: p.primaryImageUrl ?? '',
    },
    rows,
    gallery,
  };
}

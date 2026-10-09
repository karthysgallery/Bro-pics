// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { FrameModel, Product, Variant } from '@bro-pics/shared';
import { loadProductSetup, publishAutoDesign, saveProductSetup, SetupError, type ArtworkStore, type ProductSetupBody } from './product-setup';
import { sixPhotoTemplate } from '@bro-pics/shared/src/personalization/test-fixtures';

// Real Firestore (emulator). Run:
//   firebase emulators:exec --only firestore --project demo-bropics "cd apps/web && npx vitest run lib/catalogue"
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!enabled)('guided product save (Firestore emulator)', { timeout: 30_000 }, () => {
  let db: Firestore;
  const run = Math.random().toString(36).slice(2, 7);
  const crops: string[] = [];
  const store: ArtworkStore = {
    async cropTo(_src, crop, dest) {
      crops.push(dest);
      return { widthPx: crop.width, heightPx: crop.height, sizeBytes: 1000 };
    },
  };
  const model = (id: string, name: string, colour: string): FrameModel => ({
    id, name, code: id.toUpperCase().slice(0, 8), colour, colourHex: '#222222', material: 'Wood', mouldingWidthIn: 1, image: null,
    costPerFoot: 3000, priceDelta: 0, isActive: true, sortOrder: 1, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z',
  });
  const teak = `teak_${run}`;
  const gold = `gold_${run}`;

  beforeAll(async () => {
    db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-bropics' }));
    await db.collection('categories').doc(`cat_${run}`).set({ id: `cat_${run}`, name: 'Devotional', slug: `devotional-${run}` });
    await db.collection('frameModels').doc(teak).set(model(teak, `Teak Classic ${run}`, `Brown ${run}`));
    await db.collection('frameModels').doc(gold).set(model(gold, `Royal Gold ${run}`, `Gold ${run}`));
    // A 4000 × 6000 artwork (2:3) — sharp for 12x18 (333 ppi), soft for 20x30 at 8x10's shape crop.
    await db.collection('media').doc(`art_${run}`).set({ id: `art_${run}`, path: `public/media/art_${run}.jpg`, type: 'image', width: 4000, height: 6000, alt: '', tags: [], usageRefs: [], isActive: true });
    await db.collection('media').doc(`photo_${run}`).set({ id: `photo_${run}`, path: `public/media/photo_${run}.jpg`, type: 'image', width: 1600, height: 1600, alt: '', tags: [], usageRefs: [], isActive: true });
  });

  const body = (over: Partial<ProductSetupBody> = {}): ProductSetupBody => ({
    productType: 'ready_made', title: 'Lord Murugan Photo Frame', slug: `lord-murugan-photo-frame-${run}`, productCode: 'MURUGAN', categoryId: `cat_${run}`,
    subject: 'Lord Murugan', shortDesc: 'Lord Murugan photo frame, printed sharp and framed by hand.', descriptionHtml: '<p>x</p>', highlights: [], howItWorks: [], careText: '',
    faq: [], badges: [], occasionTags: [], status: 'published', isFeatured: false, allowsTextPersonalization: false, dispatchDaysMin: 2, dispatchDaysMax: 4,
    seo: { title: '', description: '', focusKeyword: 'lord murugan photo frame', keywords: [], imageAlt: 'Lord Murugan photo frame', noindex: false },
    frameModelIds: [teak, gold],
    rows: [
      { widthIn: 8, heightIn: 12, frameModelId: teak, mrp: 99900, price: 79900, cost: 30000, isActive: true },
      { widthIn: 12, heightIn: 18, frameModelId: teak, mrp: 159900, price: 129900, cost: 50000, isActive: true },
      { widthIn: 12, heightIn: 18, frameModelId: gold, mrp: 179900, price: 149900, cost: 60000, isActive: true },
      { widthIn: 8, heightIn: 10, frameModelId: gold, mrp: 89900, price: 69900, cost: 28000, isActive: true },
    ],
    gallery: [], artworkMediaId: `art_${run}`, collageTemplateId: null,
    ...over,
  });

  let readyId = '';

  it('ready-made: one sized variant per row, private costs, a published print design per frame shape, artwork as the photo', async () => {
    const result = await saveProductSetup(db, store, null, body());
    readyId = result.productId;
    const product = (await db.collection('products').doc(readyId).get()).data() as Product;
    expect(product).toMatchObject({ productType: 'ready_made', photoSlots: 0, frameModelIds: [teak, gold], basePrice: 69900, isActive: true, productCode: 'MURUGAN' });
    expect(product.primaryImageUrl).toBe(`/api/media/art_${run}/image?w=1600`);

    const variants = (await db.collection('products').doc(readyId).collection('variants').get()).docs.map((d) => d.data() as Variant);
    expect(variants).toHaveLength(4);
    const big = variants.find((v) => v.sizeLabel === '12x18 in' && v.frameModelId === gold)!;
    expect(big).toMatchObject({ frameColour: `Royal Gold ${run}`, price: 149900, compareAtPrice: 179900, printWidthPx: 3600 });
    expect(big).not.toHaveProperty('cost');
    expect((await db.collection('variantCosts').doc(big.id).get()).data()).toMatchObject({ cost: 60000, productId: readyId });

    // 2:3 sizes share one design, 8x10 (4:5) gets its own; both published ready-made designs with the artwork printed.
    const designs = new Set(variants.map((v) => v.personalizationTemplateId));
    expect(designs.size).toBe(2);
    for (const id of designs) {
      const summary = (await db.collection('personalizationTemplates').doc(id!).get()).data()!;
      expect(summary).toMatchObject({ type: 'ready_made', publishedVersion: 1 });
    }
    expect(product.personalizationTemplateId).toBe(variants.find((v) => v.sizeLabel === '8x12 in')!.personalizationTemplateId);
    expect(crops).toHaveLength(2);
    // 8x10 crop of a 2:3 image keeps 83%: the owner is told the edges are trimmed.
    expect(result.warnings.some((w) => /8x10: the artwork is a different shape/.test(w))).toBe(true);
  });

  it('re-saving with nothing changed keeps the same design versions and does not re-crop', async () => {
    const before = crops.length;
    await saveProductSetup(db, store, readyId, body());
    expect(crops.length).toBe(before);
    const variants = (await db.collection('products').doc(readyId).collection('variants').get()).docs.map((d) => d.data() as Variant);
    for (const id of new Set(variants.map((v) => v.personalizationTemplateId))) {
      expect((await db.collection('personalizationTemplates').doc(id!).get()).get('latestVersion')).toBe(1);
    }
  });

  it('a size taken out of the grid is switched off, not deleted; a changed price is saved', async () => {
    const b = body();
    await saveProductSetup(db, store, readyId, { ...b, rows: [{ ...b.rows[0]!, price: 74900 }, ...b.rows.slice(1, 3)] });
    const variants = (await db.collection('products').doc(readyId).collection('variants').get()).docs.map((d) => d.data() as Variant);
    expect(variants).toHaveLength(4);
    expect(variants.find((v) => v.sizeLabel === '8x10 in')!.isActive).toBe(false);
    expect(variants.find((v) => v.sizeLabel === '8x12 in')!.price).toBe(74900);
  });

  it('loads back in the editor shape, including private costs', async () => {
    const loaded = await loadProductSetup(db, readyId);
    expect(loaded.product).toMatchObject({ productType: 'ready_made', isLegacy: false, frameModelIds: [teak, gold], subject: 'Lord Murugan' });
    expect(loaded.rows.find((r) => r.widthIn === 12 && r.frameModelId === gold)).toMatchObject({ mrp: 179900, price: 149900, cost: 60000, isActive: true });
    expect(loaded.gallery[0]).toMatchObject({ mediaId: `art_${run}` });
  });

  it('single photo: a one-photo design per shape, the chosen photos as the gallery', async () => {
    const result = await saveProductSetup(db, store, null, body({
      productType: 'single_photo', title: 'Classic Photo Frame', slug: `classic-photo-frame-${run}`, productCode: 'CLASSIC', artworkMediaId: null,
      gallery: [{ mediaId: `photo_${run}`, alt: 'Classic photo frame' }],
    }));
    const product = (await db.collection('products').doc(result.productId).get()).data() as Product;
    expect(product).toMatchObject({ productType: 'single_photo', photoSlots: 1, artwork: null, primaryImageUrl: `/api/media/photo_${run}/image?w=1600` });
    const summary = (await db.collection('personalizationTemplates').doc(product.personalizationTemplateId!).get()).data()!;
    expect(summary).toMatchObject({ type: 'single_photo', publishedVersion: 1 });
  });

  it('collage: links the design made in the template builder; photo count and sizes follow it', async () => {
    // A 6-photo 3:2 landscape collage, published as the template builder would.
    const design = await publishAutoDesign(db, { ...sixPhotoTemplate, id: `collage_${run}`, layers: sixPhotoTemplate.layers.filter((l) => l.kind !== 'fixed') }, new Date());
    const result = await saveProductSetup(db, store, null, body({
      productType: 'collage', title: 'Six Memories Collage', slug: `six-memories-${run}`, productCode: 'SIX', artworkMediaId: null, collageTemplateId: design.id,
      gallery: [{ mediaId: `photo_${run}`, alt: '' }],
      rows: [
        { widthIn: 18, heightIn: 12, frameModelId: teak, mrp: 199900, price: 159900, cost: 50000, isActive: true },
        { widthIn: 12, heightIn: 12, frameModelId: teak, mrp: 99900, price: 89900, cost: 30000, isActive: true },
      ],
      frameModelIds: [teak],
    }));
    const product = (await db.collection('products').doc(result.productId).get()).data() as Product;
    expect(product).toMatchObject({ productType: 'collage', photoSlots: 6, personalizationTemplateId: design.id });
    const variants = (await db.collection('products').doc(result.productId).collection('variants').get()).docs.map((d) => d.data() as Variant);
    expect(variants.every((v) => v.personalizationTemplateId === null)).toBe(true); // they use the product's design
    // 12x12 is square, the design is 3:2: the owner is warned the print would stretch.
    expect(result.warnings.some((w) => /12x12: this size is a different shape/.test(w))).toBe(true);
  });

  it('refuses a web address another product already uses', async () => {
    await expect(saveProductSetup(db, store, null, body({ productCode: 'OTHER' }))).rejects.toThrow(SetupError);
  });

  it('converting an older product keeps its existing variant ids (carts and past orders still point at them)', async () => {
    const ref = db.collection('products').doc(`legacy_${run}`);
    await ref.set({ id: ref.id, title: 'Old Frame', slug: `old-frame-${run}`, categoryId: `cat_${run}`, photoSlots: 1, isActive: true, seo: {}, createdAt: new Date(), updatedAt: new Date() });
    await ref.collection('variants').doc(`legacy_v_${run}`).set({ id: `legacy_v_${run}`, productId: ref.id, sku: 'OLD-8X12-BLK', sizeLabel: '8x12 in', widthIn: 8, heightIn: 12, frameColour: `Brown ${run}`, material: 'Wood', price: 79900, stockStatus: 'in_stock', printWidthPx: 2400, printHeightPx: 3600, minUploadPx: 2400, aspectRatio: 0.667, isActive: true });
    const loaded = await loadProductSetup(db, ref.id);
    expect(loaded.product).toMatchObject({ productType: 'single_photo', isLegacy: true });
    expect(loaded.rows[0]).toMatchObject({ variantId: `legacy_v_${run}`, frameModelId: teak, legacyFinish: `Brown ${run}`, mrp: 79900 }); // matched by colour
    const r = loaded.rows[0]!;
    await saveProductSetup(db, store, ref.id, body({
      productType: 'single_photo', title: 'Old Frame', slug: `old-frame-${run}`, productCode: 'OLD', artworkMediaId: null, frameModelIds: [teak],
      rows: [{ variantId: r.variantId, widthIn: r.widthIn, heightIn: r.heightIn, frameModelId: r.frameModelId!, mrp: 99900, price: 79900, cost: 30000, isActive: true }],
    }));
    const v = (await ref.collection('variants').doc(`legacy_v_${run}`).get()).data() as Variant;
    expect(v).toMatchObject({ isActive: true, frameModelId: teak, frameColour: `Teak Classic ${run}`, compareAtPrice: 99900 });
    expect((await ref.collection('variants').get()).size).toBe(1);
  });
});

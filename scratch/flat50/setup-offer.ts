// Sets up the Flat 50% offer: the "Your Photo Frame" product (DRAFT), the offer page settings (switched OFF) and the
// homepage banner (switched OFF). Safe to run again: the product is found by its web address and updated, the offer
// page and banner keep any changes the owner made in Admin (only missing fields are filled in).
//
// Emulator:   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 GCLOUD_PROJECT=demo-bropics BUCKET=demo-bropics.appspot.com npx tsx setup-offer.ts
// Production: run-setup-offer.sh (signed in as the owner).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { saveProductSetup, ProductSetupBodySchema, mediaImageUrl } from '../../apps/web/lib/catalogue/product-setup';
import { generateProductDetails } from '@bro-pics/shared';

const project = process.env.GCLOUD_PROJECT ?? 'demo-bropics';
const BUCKET = process.env.BUCKET ?? `${project}.appspot.com`;
if (!process.env.FIRESTORE_EMULATOR_HOST && process.env.CONFIRM !== project) {
  console.error(`Refusing to write to the real project "${project}" without CONFIRM=${project}.`);
  process.exit(1);
}
if (!getApps().length) initializeApp({ projectId: project, storageBucket: BUCKET, ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }) });
const db = getFirestore();
const bucket = getStorage().bucket();
const requireFromWeb = createRequire(join(__dirname, '../../apps/web/package.json'));
const STOCK = join(__dirname, '../collage-import/stock');
const now = new Date();

async function putMedia(file: string, alt: string, tag: string): Promise<string> {
  const buf = readFileSync(file);
  const id = `ofr_${createHash('sha256').update(buf).digest('hex').slice(0, 20)}`;
  const sharp = requireFromWeb('sharp') as typeof import('sharp');
  const jpg = await sharp(buf).rotate().jpeg({ quality: 88 }).toBuffer();
  const meta = await sharp(jpg).metadata();
  const path = `public/media/${id}.jpg`;
  const [inBucket] = await bucket.file(path).exists();
  if (!inBucket) await bucket.file(path).save(jpg, { contentType: 'image/jpeg', resumable: false, metadata: { cacheControl: 'public, max-age=31536000' } });
  const ref = db.collection('media').doc(id);
  if (!(await ref.get()).exists) await ref.set({ id, path, type: 'image', width: meta.width, height: meta.height, sizeBytes: jpg.length, alt, tags: [tag], usageRefs: [], isActive: true, createdAt: now, updatedAt: now });
  return id;
}

// The poster's prices (owner-approved 2026-11-17). Costs are the owner's existing per-size costs; 16x20 has no
// existing product, so its cost is set between the two — check it in Admin → product → sizes.
const SIZES: Array<[number, number, number, number, number]> = [
  // short side, long side, MRP, offer price, cost (paise)
  [12, 18, 100000, 49900, 40000],
  [16, 20, 200000, 99900, 45000],
  [16, 24, 300000, 149900, 50000],
];

(async () => {
  const title = 'Your Photo Frame';
  const slug = 'your-photo-frame';
  const samples: string[] = [];
  for (const f of readdirSync(STOCK).filter((x) => /^(couple|family)-/.test(x)).sort().slice(0, 6)) {
    samples.push(mediaImageUrl(await putMedia(join(STOCK, f), 'Sample photo (Unsplash, free licence)', 'sample-photo')));
  }
  const rows = SIZES.flatMap(([a, b, mrp, price, cost]) => [
    { widthIn: a, heightIn: b, frameModelId: 'normal-frame-1-inch', mrp, price, cost, isActive: true },
    { widthIn: b, heightIn: a, frameModelId: 'normal-frame-1-inch', mrp, price, cost, isActive: true },
  ]);
  const sizeLabels = rows.map((r) => `${r.widthIn}x${r.heightIn} in`);
  const auto = generateProductDetails({
    name: title, productType: 'single_photo', subject: 'your photo', categoryName: 'Photo Frames', sizeLabels,
    frameModels: [{ name: 'Normal Frame 1 inch', colour: 'Black', material: 'Wood' }], photoCount: 1, dispatchDaysMin: 2, dispatchDaysMax: 4,
  });
  const existing = await db.collection('products').where('slug', '==', slug).limit(1).get();
  const productId = existing.empty ? null : existing.docs[0]!.id;
  const keepStatus = existing.empty ? 'draft' : (existing.docs[0]!.get('status') as 'draft' | 'published' | 'archived') ?? 'draft';
  const body = ProductSetupBodySchema.parse({
    productType: 'single_photo', title, slug, productCode: 'YOURPHOTO', categoryId: 'cat_frames', subject: 'your photo',
    shortDesc: 'Your favourite photo, printed sharp and framed by hand. Add a name or a date if you like, see it framed before you pay, and hang it the day it arrives.',
    descriptionHtml: auto.descriptionHtml,
    highlights: ['Any photo from your phone', 'Optional line of text — a name, a date or a wish', 'Premium print, laminated, on 8 mm MDF', 'Hand-finished frame, ready to hang', 'Preview it framed before you pay'],
    howItWorks: ['Pick a size and portrait or landscape', 'Upload your photo (or send it on WhatsApp after ordering)', 'Add a line of text if you like', 'Check the preview, add to cart and pay'],
    careText: auto.careText, faq: auto.faq,
    badges: ['Flat 50% OFF'], occasionTags: [...new Set(['birthday', 'anniversary', 'gift', ...auto.occasionTags])].slice(0, 10),
    status: keepStatus, isFeatured: false, allowsTextPersonalization: true, couponsExcluded: true, dispatchDaysMin: 2, dispatchDaysMax: 4,
    seo: { title: 'Personalised Photo Frame — Your Photo, Framed | KarthysGallery', description: 'Turn any photo into a framed print: 18×12, 20×16 or 24×16 inch, hand-finished and ready to hang. Preview online before you pay.', focusKeyword: 'personalised photo frame', keywords: ['photo frame with my photo', 'custom photo frame', 'photo to frame', 'personalised photo frame online'], imageAlt: 'Personalised photo frame with your photo', noindex: false },
    frameModelIds: ['normal-frame-1-inch'], rows, gallery: [], autoPhotoKey: null, samplePhotos: samples,
    glitter: { enabled: false, extraPrice: 10000 }, artworkMediaId: null, collageTemplateId: null,
  });
  const store = { async cropTo() { throw new Error('not used for photo frames'); } };
  const res = await saveProductSetup(db, store, productId, body, now);

  // Offer page: created switched off; on a re-run only fields the owner has not set are filled in.
  const posterId = await putMedia(join(__dirname, 'poster.webp'), 'Flat 50% OFF — KarthysGallery photo frames', 'offer');
  const offerRef = db.collection('offerPages').doc('flat-50');
  const offer = (await offerRef.get()).data() ?? {};
  await offerRef.set({
    slug: 'flat-50', isActive: false, title: 'Flat 50% OFF', subtitle: 'Make your memories beautiful',
    heroImage: mediaImageUrl(posterId), productId: res.productId, sizeLabels: ['18x12 in', '20x16 in', '24x16 in'],
    ctaLabel: 'Shop now', deliveryNote: 'Free delivery across Tamil Nadu',
    faq: [
      { question: 'How do I order?', answer: 'Choose a size, upload your photo, add a line of text if you like, check the preview and pay. We print, frame and dispatch it.' },
      { question: 'Can I send my photo on WhatsApp instead?', answer: 'Yes. On the product page choose "Send photos on WhatsApp", place the order, and send the photo to us on WhatsApp with your order number.' },
      { question: 'Is delivery free?', answer: 'Delivery is free anywhere in Tamil Nadu. For other states the delivery charge is shown at checkout before you pay.' },
      { question: 'When will it be dispatched?', answer: 'Usually within 2–4 working days of your photo reaching us.' },
      { question: 'Do I need a discount code?', answer: 'No. The offer price is already applied.' },
    ],
    startsAt: null, endsAt: null, ...offer, updatedAt: now,
  });

  // Homepage banner: switched off until the owner uploads the three pictures (or approves the ones made for it).
  const bannerRef = db.collection('banners').doc('flat-50');
  const banner = (await bannerRef.get()).data() ?? {};
  await bannerRef.set({
    id: 'flat-50', title: 'Flat 50% OFF', subtitle: 'Make your memories beautiful', image: '', tabletImage: '', mobileImage: '',
    link: '/offers/flat-50', ctaLabel: 'Shop the offer', couponCode: null, startsAt: null, endsAt: null, isActive: false, sortOrder: 0, ...banner,
  });

  console.log(JSON.stringify({ productId: res.productId, slug, status: keepStatus, sizes: sizeLabels, warnings: res.warnings, offerPage: 'offerPages/flat-50 (off)', banner: 'banners/flat-50 (off)' }));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

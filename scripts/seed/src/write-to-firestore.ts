import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  seedCategories,
  seedProducts,
  seedVariants,
  seedReviews,
  seedProductMedia,
  seedHomepageSections,
  seedFrameTemplates,
} from './data';
import { loadEnvLocal } from './load-env';

async function main(): Promise<void> {
  loadEnvLocal();
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');

  const app = initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });

  let batch = db.batch();
  let opCount = 0;
  const commits: Promise<unknown>[] = [];

  function stage(ref: FirebaseFirestore.DocumentReference, data: object): void {
    batch.set(ref, data);
    opCount++;
    if (opCount >= 400) {
      commits.push(batch.commit());
      batch = db.batch();
      opCount = 0;
    }
  }

  for (const category of seedCategories) {
    stage(db.collection('categories').doc(category.id), category);
  }
  for (const product of seedProducts) {
    stage(db.collection('products').doc(product.id), product);
  }
  for (const variant of seedVariants) {
    stage(db.collection('products').doc(variant.productId).collection('variants').doc(variant.id), variant);
  }
  for (const media of seedProductMedia) {
    stage(db.collection('products').doc(media.productId).collection('media').doc(media.id), media);
  }
  for (const template of seedFrameTemplates) {
    const variant = seedVariants.find((v) => v.id === template.variantId)!;
    stage(
      db.collection('products').doc(variant.productId).collection('frameTemplates').doc(template.id),
      template
    );
  }
  for (const review of seedReviews) {
    stage(db.collection('reviews').doc(review.id), review);
  }
  for (const section of seedHomepageSections) {
    stage(db.collection('homepageSections').doc(section.id), section);
  }

  commits.push(batch.commit());
  await Promise.all(commits);

  console.log(
    `Seeded ${seedCategories.length} categories, ${seedProducts.length} products, ${seedVariants.length} variants, ${seedProductMedia.length} media docs, ${seedFrameTemplates.length} frame templates, ${seedReviews.length} reviews, ${seedHomepageSections.length} homepage sections.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

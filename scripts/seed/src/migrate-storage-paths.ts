import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { writeFileSync } from 'node:fs';
import { loadEnvLocal } from './load-env';
import { planFieldMigration, type MigrationEntry } from './migration-plan';

/**
 * BE-05a: converts legacy signed-URL fields (Upload.originalUrl,
 * Customization.previewUrl/renderedFileUrl, order items' previewUrl, and
 * cart-line previewUrl inside carts/{userId}.items[]) written before
 * 2026-09-23 into their *Path equivalents. Dry-run by default; pass
 * --execute to actually write. Idempotent (safe to re-run — already-
 * migrated docs are skipped) and NEVER deletes a legacy field, per the
 * plan's own requirement. Writes a JSON exception report for anything it
 * can't parse, rather than guessing or dropping data silently.
 *
 * Usage:
 *   pnpm --filter @bro-pics/seed migrate-storage-paths            # dry run
 *   pnpm --filter @bro-pics/seed migrate-storage-paths -- --execute
 */

async function planUploads(db: Firestore, bucket: string): Promise<MigrationEntry[]> {
  const snap = await db.collection('uploads').get();
  return snap.docs.map((doc) => planFieldMigration('uploads', doc.id, doc.data(), 'originalUrl', 'originalPath', bucket));
}

async function planCustomizations(db: Firestore, bucket: string): Promise<MigrationEntry[]> {
  const snap = await db.collection('customizations').get();
  const entries: MigrationEntry[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    entries.push(planFieldMigration('customizations', doc.id, data, 'previewUrl', 'previewPath', bucket));
    entries.push(planFieldMigration('customizations', doc.id, data, 'renderedFileUrl', 'renderedFilePath', bucket));
  }
  return entries;
}

interface CartItemPlan {
  entry: MigrationEntry;
  itemIndex: number;
}

async function planCarts(db: Firestore, bucket: string): Promise<{ userId: string; items: CartItemPlan[] }[]> {
  const snap = await db.collection('carts').get();
  return snap.docs.map((doc) => {
    const items = (doc.data().items as Array<Record<string, unknown>>) ?? [];
    return {
      userId: doc.id,
      items: items.map((item, itemIndex) => ({
        itemIndex,
        entry: planFieldMigration(`carts/${doc.id}/items`, `[${itemIndex}]`, item, 'previewUrl', 'previewPath', bucket),
      })),
    };
  });
}

async function planOrderItems(db: Firestore, bucket: string): Promise<MigrationEntry[]> {
  const snap = await db.collectionGroup('items').get();
  return snap.docs
    .filter((doc) => doc.ref.parent.parent?.parent.id === 'orders')
    .map((doc) =>
      planFieldMigration(`orders/${doc.ref.parent.parent!.id}/items`, doc.id, doc.data(), 'previewUrl', 'previewPath', bucket)
    );
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');

  loadEnvLocal();
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
  if (!bucketName) throw new Error('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set');

  const app = initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  const db = getFirestore(app);

  const [uploads, customizations, orderItems, carts] = await Promise.all([
    planUploads(db, bucketName),
    planCustomizations(db, bucketName),
    planOrderItems(db, bucketName),
    planCarts(db, bucketName),
  ]);

  const flatCartEntries = carts.flatMap((c) => c.items.map((i) => i.entry));
  const allEntries = [...uploads, ...customizations, ...orderItems, ...flatCartEntries];

  const toConvert = allEntries.filter((e) => e.action === 'convert');
  const alreadyMigrated = allEntries.filter((e) => e.action === 'already-migrated');
  const noLegacyValue = allEntries.filter((e) => e.action === 'no-legacy-value');
  const exceptions = allEntries.filter((e) => e.action === 'exception-unparseable');

  console.log(`Scanned ${allEntries.length} field-checks:`);
  console.log(`  to convert:       ${toConvert.length}`);
  console.log(`  already migrated: ${alreadyMigrated.length}`);
  console.log(`  no legacy value:  ${noLegacyValue.length}`);
  console.log(`  exceptions:       ${exceptions.length}`);

  if (exceptions.length > 0) {
    const reportPath = `migration-exceptions-${Date.now()}.json`;
    writeFileSync(reportPath, JSON.stringify(exceptions, null, 2));
    console.log(`\nException report written to ${reportPath} — review before trusting the migration is complete.`);
  }

  if (!execute) {
    console.log('\nDRY RUN — no writes made. Re-run with --execute to apply the conversions above.');
    return;
  }

  let written = 0;
  // uploads/{id} and customizations/{id} — flat collections, direct field update.
  for (const entry of [...uploads, ...customizations].filter((e) => e.action === 'convert')) {
    await db.collection(entry.collection).doc(entry.docId).update({ [entry.newField]: entry.newValue });
    written++;
  }
  // orders/{orderId}/items/{itemId}
  for (const entry of orderItems.filter((e) => e.action === 'convert')) {
    const orderId = entry.collection.split('/')[1];
    await db.collection('orders').doc(orderId).collection('items').doc(entry.docId).update({ [entry.newField]: entry.newValue });
    written++;
  }
  // carts/{userId} — whole-array rewrite per user, only for users with at least one convertible item
  for (const cart of carts) {
    const convertible = cart.items.filter((i) => i.entry.action === 'convert');
    if (convertible.length === 0) continue;
    const snap = await db.collection('carts').doc(cart.userId).get();
    const items = (snap.data()?.items as Array<Record<string, unknown>>) ?? [];
    for (const { itemIndex, entry } of convertible) {
      if (items[itemIndex]) items[itemIndex] = { ...items[itemIndex], [entry.newField]: entry.newValue };
    }
    await db.collection('carts').doc(cart.userId).set({ items });
    written += convertible.length;
  }

  console.log(`\nExecuted: wrote ${written} converted fields. Legacy fields were left in place, as required.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

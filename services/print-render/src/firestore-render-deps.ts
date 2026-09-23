import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { FrameTemplate, Variant } from '@bro-pics/shared';
// Not from the main '@bro-pics/shared' barrel — see print-jobs.ts's own
// doc comment for why. This is a standalone Cloud Run service (never
// bundled for a browser), so importing it directly here is exactly the
// intended use.
import { leasePrintJob, failPrintJob, completePrintJobAndAdvanceOrder } from '@bro-pics/shared/src/print-jobs/print-jobs';
import { getAdminApp } from './firebase-admin';
import type { RenderJobDependencies } from './render-job';

/**
 * The real Firestore/Storage-backed implementation of RenderJobDependencies
 * [BE-18]. Read paths intentionally read raw snapshot fields rather than
 * re-parsing through a z.date()-bearing schema — see
 * packages/shared/src/print-jobs/print-jobs.ts's comment on the same
 * Timestamp-vs-Date issue, caught there by a real emulator test.
 */
export function buildFirestoreRenderDeps(): RenderJobDependencies {
  const app = getAdminApp();
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket();

  return {
    async leaseJob(jobId) {
      await leasePrintJob(db, jobId);
    },
    async failJob(jobId, error) {
      await failPrintJob(db, jobId, error);
    },
    async completeJobAndAdvanceOrder(jobId, renderedFilePath) {
      await completePrintJobAndAdvanceOrder(db, jobId, renderedFilePath);
    },
    async getPrintJob(jobId) {
      const snap = await db.collection('printJobs').doc(jobId).get();
      if (!snap.exists) return null;
      const data = snap.data() as { orderId: string; itemId: string; personalizationId: string };
      return { orderId: data.orderId, itemId: data.itemId, personalizationId: data.personalizationId };
    },
    async getOrderItem(orderId, itemId) {
      const snap = await db.collection('orders').doc(orderId).collection('items').doc(itemId).get();
      if (!snap.exists) return null;
      const data = snap.data() as { variantId: string };
      return { variantId: data.variantId };
    },
    async getVariant(variantId) {
      // variants is a subcollection of products — a collection-group query
      // is the only way to find one by id alone. The 'id' field already
      // has a COLLECTION_GROUP index enabled (firestore.indexes.json's
      // fieldOverrides — see apps/web/lib/variant-lookup.ts, the existing
      // precedent for this exact lookup).
      const snapshot = await db.collectionGroup('variants').where('id', '==', variantId).limit(1).get();
      if (snapshot.empty) return null;
      const data = snapshot.docs[0]!.data() as Variant;
      return { printWidthPx: data.printWidthPx, printHeightPx: data.printHeightPx };
    },
    async getCustomizationsForPersonalization(personalizationId) {
      const snapshot = await db
        .collection('customizations')
        .where('personalizationId', '==', personalizationId)
        .get();
      return snapshot.docs
        .map((doc) => {
          const data = doc.data() as {
            uploadId: string;
            slotIndex: number;
            templateVersion: number;
            transformJson: { cropRect: { x: number; y: number; width: number; height: number }; rotationDeg: 0 | 90 | 180 | 270 };
          };
          return {
            id: doc.id,
            uploadId: data.uploadId,
            slotIndex: data.slotIndex,
            templateVersion: data.templateVersion,
            cropRect: data.transformJson.cropRect,
            rotationDeg: data.transformJson.rotationDeg,
          };
        })
        .sort((a, b) => a.slotIndex - b.slotIndex);
    },
    async getFrameTemplate(variantId, templateVersion) {
      // Same "query the indexed field, filter the rest in memory" approach
      // as GET /api/frame-templates/[variantId] — 'variantId' has a
      // COLLECTION_GROUP index enabled; 'version' does not, and adding one
      // for a query with exactly one caller isn't worth it.
      const snapshot = await db.collectionGroup('frameTemplates').where('variantId', '==', variantId).get();
      const match = snapshot.docs.map((doc) => doc.data() as FrameTemplate).find((t) => t.version === templateVersion);
      if (!match) return null;
      return {
        mockupUrl: match.mockupUrl,
        maskUrl: match.maskUrl,
        overlayUrl: match.overlayUrl,
        printableRects: match.printableRects,
      };
    },
    async getUpload(uploadId) {
      const snap = await db.collection('uploads').doc(uploadId).get();
      if (!snap.exists) return null;
      const data = snap.data() as { originalPath: string };
      return { originalPath: data.originalPath };
    },
    async fetchPublicAsset(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch public asset ${url}: ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },
    async downloadPrivateFile(path) {
      const [buffer] = await bucket.file(path).download();
      return buffer;
    },
    async uploadPrintFile(orderId, itemId, filename, buffer, contentType) {
      const path = `print-files/${orderId}/${itemId}/${filename}`;
      await bucket.file(path).save(buffer, { contentType });
      return path;
    },
    async markCustomizationsRendered(customizationIds, renderedFilePath) {
      const batch = db.batch();
      for (const id of customizationIds) {
        batch.update(db.collection('customizations').doc(id), { renderStatus: 'done', renderedFilePath });
      }
      await batch.commit();
    },
    async markCustomizationsFailed(customizationIds) {
      const batch = db.batch();
      for (const id of customizationIds) {
        batch.update(db.collection('customizations').doc(id), { renderStatus: 'failed' });
      }
      await batch.commit();
    },
  };
}

export type { Firestore };

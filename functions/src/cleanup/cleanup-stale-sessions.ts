import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { findStaleAnonymousDocs, type DocForCleanup } from '@bro-pics/shared';

export interface CleanupDeps {
  fetchCandidateUploads(): Promise<Array<DocForCleanup & { originalPath: string }>>;
  fetchCandidateCustomizations(): Promise<DocForCleanup[]>;
  deleteUpload(id: string, originalPath: string): Promise<void>;
  deleteCustomization(id: string): Promise<void>;
}

/**
 * [BE-35] "TTL cleanup" for anonymous sessions that never reconciled to
 * an account (reconcileSessionOnLogin) and never turned into an order.
 * fetchCandidateUploads/fetchCandidateCustomizations only need to
 * pre-filter on createdAt being old enough to query efficiently — the
 * userId-missing check is done by findStaleAnonymousDocs (packages/
 * shared), the same pure-function-plus-glue split every other Cloud
 * Function in this codebase already uses. Deletes both the Firestore doc
 * and (for uploads) the Storage object — Customization.previewPath is
 * NOT cleaned up here, a known, minor, deliberately out-of-scope loose
 * end (it's a preview render, not the customer's original photo — the
 * real storage cost this cleanup targets).
 */
export async function runStaleSessionCleanup(deps: CleanupDeps, now: Date = new Date()): Promise<{ deletedUploadIds: string[]; deletedCustomizationIds: string[] }> {
  const [uploadCandidates, customizationCandidates] = await Promise.all([
    deps.fetchCandidateUploads(),
    deps.fetchCandidateCustomizations(),
  ]);

  const staleUploadIds = new Set(findStaleAnonymousDocs(uploadCandidates, now));
  const staleCustomizationIds = new Set(findStaleAnonymousDocs(customizationCandidates, now));

  const deletedUploadIds: string[] = [];
  for (const upload of uploadCandidates) {
    if (staleUploadIds.has(upload.id)) {
      await deps.deleteUpload(upload.id, upload.originalPath);
      deletedUploadIds.push(upload.id);
    }
  }

  const deletedCustomizationIds: string[] = [];
  for (const customization of customizationCandidates) {
    if (staleCustomizationIds.has(customization.id)) {
      await deps.deleteCustomization(customization.id);
      deletedCustomizationIds.push(customization.id);
    }
  }

  return { deletedUploadIds, deletedCustomizationIds };
}

const THRESHOLD_DAYS = 30;

export const cleanupStaleSessions = onSchedule('every 24 hours', async () => {
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const cutoff = new Date(Date.now() - THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  await runStaleSessionCleanup({
    async fetchCandidateUploads() {
      const snapshot = await db.collection('uploads').where('createdAt', '<', cutoff).get();
      return snapshot.docs.map((doc) => {
        const data = doc.data() as { userId?: string; createdAt: FirebaseFirestore.Timestamp; originalPath: string };
        return { id: doc.id, userId: data.userId, createdAt: data.createdAt.toDate(), originalPath: data.originalPath };
      });
    },
    async fetchCandidateCustomizations() {
      const snapshot = await db.collection('customizations').where('createdAt', '<', cutoff).get();
      return snapshot.docs.map((doc) => {
        const data = doc.data() as { userId?: string; createdAt: FirebaseFirestore.Timestamp };
        return { id: doc.id, userId: data.userId, createdAt: data.createdAt.toDate() };
      });
    },
    async deleteUpload(id, originalPath) {
      await db.collection('uploads').doc(id).delete();
      await bucket.file(originalPath).delete({ ignoreNotFound: true });
    },
    async deleteCustomization(id) {
      await db.collection('customizations').doc(id).delete();
    },
  });
});

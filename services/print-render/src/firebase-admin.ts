import { type App, getApps, initializeApp, cert } from 'firebase-admin/app';

// Same pattern as apps/web/lib/firebase-admin.ts (minus the Next.js-only
// 'server-only' import, which has no meaning outside a Next.js build) —
// a Cloud Run service in the same GCP project authenticates the same way.
export function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
  }

  return initializeApp({
    credential: cert(JSON.parse(serviceAccountJson)),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

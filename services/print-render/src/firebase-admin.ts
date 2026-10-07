import { type App, getApps, initializeApp, cert } from 'firebase-admin/app';

/**
 * On Cloud Run the service runs as its own service account, so Application
 * Default Credentials are used (no key file). FIREBASE_SERVICE_ACCOUNT_JSON
 * is still honoured for running outside Google Cloud. The Storage bucket is
 * required either way: print files must never go to a guessed bucket.
 */
export function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  if (!storageBucket) {
    throw new Error('FIREBASE_STORAGE_BUCKET is not set');
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return serviceAccountJson
    ? initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), storageBucket })
    : initializeApp({ storageBucket });
}

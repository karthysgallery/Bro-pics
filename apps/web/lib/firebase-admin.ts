import { type App, getApps, initializeApp, cert } from 'firebase-admin/app';

export function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
  }

  return initializeApp({
    credential: cert(JSON.parse(serviceAccountJson)),
  });
}

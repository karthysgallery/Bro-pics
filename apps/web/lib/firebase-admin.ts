import 'server-only';
import { generateKeyPairSync } from 'node:crypto';
import { type App, getApps, initializeApp, cert } from 'firebase-admin/app';

export function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  // Local QA against the Firebase emulators: the Admin SDK talks to them
  // automatically when FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST /
  // FIREBASE_STORAGE_EMULATOR_HOST are set, and needs no credentials. Never
  // honoured in production, so a real deploy always requires the service account.
  if (process.env.NODE_ENV !== 'production' && process.env.FIRESTORE_EMULATOR_HOST) {
    // The emulators ignore credentials, but the app signs Storage URLs, which
    // needs *some* private key. A throwaway one, generated per process and never
    // trusted by anything real, keeps that code path working locally.
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-bropics';
    return initializeApp({
      credential: cert({ projectId, clientEmail: `emulator@${projectId}.iam.gserviceaccount.com`, privateKey }),
      projectId,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    // On Google Cloud the site runs as its own service account: Application
    // Default Credentials, no key file. K_SERVICE = running on Cloud Run;
    // GOOGLE_ADC=1 = the container build on Cloud Build (reads the catalogue
    // to pre-render pages, as the Vercel build does). Signing URLs/custom
    // tokens then goes through the IAM Credentials API (Token Creator on itself).
    if (process.env.K_SERVICE || process.env.GOOGLE_ADC === '1') {
      return initializeApp({ storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET });
    }
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
  }

  return initializeApp({
    credential: cert(JSON.parse(serviceAccountJson)),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

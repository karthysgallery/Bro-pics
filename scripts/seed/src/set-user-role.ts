import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { loadEnvLocal } from './load-env';

async function main(): Promise<void> {
  const [uid, role] = process.argv.slice(2);
  if (!uid || (role !== 'admin' && role !== 'staff')) {
    console.error('Usage: pnpm --filter @bro-pics/seed set-user-role <uid> <admin|staff>');
    process.exit(1);
  }

  loadEnvLocal();
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');

  const app = initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  await getAuth(app).setCustomUserClaims(uid, { role });

  console.log(`Set role '${role}' on user ${uid}. They must sign out and back in (or refresh their ID token) for this to take effect.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

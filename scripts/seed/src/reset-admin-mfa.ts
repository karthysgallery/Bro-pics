import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { loadEnvLocal } from './load-env';

/**
 * Break-glass for a lost phone when no recovery code is left: removes the
 * authenticator from ONE staff account, so it sets up a new app at its next
 * sign-in. It needs the project's own server credentials, which only the
 * owner has — the website cannot do this without the authenticator step.
 *
 *   pnpm --filter @bro-pics/seed reset-admin-mfa +919812345678
 *
 * Every existing "verified" browser of that account is signed out of the admin at once.
 */
async function main(): Promise<void> {
  const [rawPhone] = process.argv.slice(2);
  if (!rawPhone || !/^\+91[6-9]\d{9}$/.test(rawPhone)) {
    console.error('Usage: pnpm --filter @bro-pics/seed reset-admin-mfa +91XXXXXXXXXX');
    process.exit(1);
  }
  loadEnvLocal();
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const app = initializeApp(json ? { credential: cert(JSON.parse(json)) } : { credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT ?? 'bropics-app' });
  const uid = (await getAuth(app).getUserByPhoneNumber(rawPhone)).uid;
  const ref = getFirestore(app).collection('staffMfa').doc(uid);
  const current = (await ref.get()).data() as { version?: number } | undefined;
  const now = new Date().toISOString();
  await ref.set({ uid, secret: null, pendingSecret: null, pendingAt: null, enabledAt: null, lastStep: null, recovery: [], failures: 0, lockedUntil: null, version: (current?.version ?? 0) + 1, updatedAt: now });
  await getFirestore(app).collection('auditLogs').add({ actorUid: 'owner-script', action: 'mfa.reset', resource: 'staffMfa', resourceId: uid, details: { via: 'reset-admin-mfa script' }, createdAt: now });
  console.log(`Authenticator removed for ${rawPhone.slice(0, 5)}…${rawPhone.slice(-3)}. They set up a new app at the next admin sign-in.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

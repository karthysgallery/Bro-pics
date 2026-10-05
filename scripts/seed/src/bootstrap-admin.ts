import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { ROLES, StaffMirrorSchema, type Role } from '@bro-pics/shared';
import { loadEnvLocal } from './load-env';
import { hashPasswordForSeed, passwordProblems } from './admin-password';

/**
 * Creates (or repairs) the first privileged account so the owner can sign in
 * to /admin WITHOUT relying on OTP — mock OTP can never sign in a privileged
 * account (the code is shown on screen), and production no longer contains
 * any hard-coded "this phone/email is an admin" bypass.
 *
 *   ADMIN_PASSWORD='Str0ngPassw0rd' pnpm --filter @bro-pics/seed bootstrap-admin +919812345678 super_admin
 *
 * The password comes from the environment (not argv) so it doesn't land in
 * shell history or process listings, and is never printed. Sign in at /signin
 * with the phone number and "Use password instead".
 */
async function main(): Promise<void> {
  const [rawPhone, rawRole = 'super_admin'] = process.argv.slice(2);
  const password = process.env.ADMIN_PASSWORD ?? '';
  const role = rawRole as Role;

  if (!rawPhone || !/^\+91[6-9]\d{9}$/.test(rawPhone) || !(ROLES as readonly string[]).includes(role)) {
    console.error(`Usage: ADMIN_PASSWORD=... pnpm --filter @bro-pics/seed bootstrap-admin +91XXXXXXXXXX <${ROLES.join('|')}>`);
    process.exit(1);
  }
  const problems = passwordProblems(password);
  if (problems.length > 0) {
    console.error(`ADMIN_PASSWORD must contain ${problems.join(', ')}.`);
    process.exit(1);
  }

  loadEnvLocal();
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
  const app = initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  const auth = getAuth(app);
  const db = getFirestore(app);

  let uid: string;
  try {
    uid = (await auth.getUserByPhoneNumber(rawPhone)).uid;
    console.log(`Found existing Firebase Auth user ${uid}`);
  } catch (error: unknown) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    uid = (await auth.createUser({ phoneNumber: rawPhone, displayName: 'Admin' })).uid;
    console.log(`Created Firebase Auth user ${uid}`);
  }

  await auth.setCustomUserClaims(uid, { role });
  const now = new Date().toISOString();
  await db
    .collection('users')
    .doc(uid)
    .set(
      { id: uid, phone: rawPhone, displayName: 'Admin', role, passwordHash: hashPasswordForSeed(password), whatsappVerified: true, updatedAt: now, createdAt: now },
      { merge: true }
    );
  await db
    .collection('staff')
    .doc(uid)
    .set(StaffMirrorSchema.parse({ uid, role, active: true, invitedBy: 'bootstrap_admin', lastLoginAt: null, updatedAt: new Date() }), { merge: true });

  console.log(`Done. ${rawPhone} is now '${role}'. Sign in at /signin with the phone number and password.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

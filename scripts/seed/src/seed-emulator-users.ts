import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { hashPasswordForSeed } from './admin-password';

/**
 * EMULATOR ONLY. Creates a super_admin and a customer with known throwaway
 * credentials so QA can sign in through the real /signin password flow.
 * Refuses to run unless the Auth + Firestore emulator hosts are set, so it
 * can never write to the live project.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     pnpm --filter @bro-pics/seed seed-emulator-users
 */
export const EMULATOR_ADMIN = { phone: '+919000000001', password: 'AdminPass1', uid: 'qa_admin' };
export const EMULATOR_CUSTOMER = { phone: '+919000000002', password: 'CustomerPass1', uid: 'qa_customer' };

async function main(): Promise<void> {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.error('Refusing to run: FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must both be set.');
    process.exit(1);
  }
  const app = initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-bropics' });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const now = new Date().toISOString();

  for (const [who, account, role] of [
    ['QA Admin', EMULATOR_ADMIN, 'super_admin'],
    ['QA Customer', EMULATOR_CUSTOMER, 'customer'],
  ] as const) {
    try {
      await auth.deleteUser(account.uid);
    } catch {
      /* not there yet */
    }
    await auth.createUser({ uid: account.uid, phoneNumber: account.phone, displayName: who });
    await auth.setCustomUserClaims(account.uid, { role });
    await db.collection('users').doc(account.uid).set({
      id: account.uid,
      phone: account.phone,
      displayName: who,
      firstName: who.split(' ')[0],
      lastName: who.split(' ')[1],
      email: null,
      role,
      passwordHash: hashPasswordForSeed(account.password),
      whatsappVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    if (role !== 'customer') {
      await db.collection('staff').doc(account.uid).set({ uid: account.uid, role, active: true, invitedBy: 'emulator_seed', lastLoginAt: null, updatedAt: new Date() });
    }
    console.log(`Created ${who}: ${account.phone} / ${account.password} (${role})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { loadEnvLocal } from './load-env';
import { StaffMirrorSchema } from '@bro-pics/shared';
import { UserSchema } from '@bro-pics/shared';
import { AddressSchema } from '@bro-pics/shared';

loadEnvLocal();

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error('Error: FIREBASE_SERVICE_ACCOUNT_JSON is not set in apps/web/.env.local');
  process.exit(1);
}

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
const auth = getAuth(app);
const db = getFirestore(app);

interface CreateUserOptions {
  phoneNumber: string;
  displayName: string;
  email?: string;
  role?: 'super_admin' | 'admin' | 'staff' | 'content_manager' | 'catalogue_manager';
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
  };
}

async function getOrCreateAuthUser(options: CreateUserOptions): Promise<{ uid: string; source: 'auth' | 'firestore-only' }> {
  try {
    const existing = await auth.getUserByPhoneNumber(options.phoneNumber);
    console.log(`✓ Found existing Firebase Auth user: ${existing.uid} (${options.phoneNumber})`);
    await auth.updateUser(existing.uid, {
      displayName: options.displayName,
      email: options.email,
    });
    return { uid: existing.uid, source: 'auth' };
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      try {
        console.log(`Creating new Firebase Auth user for ${options.phoneNumber}...`);
        const created = await auth.createUser({
          phoneNumber: options.phoneNumber,
          displayName: options.displayName,
          email: options.email,
        });
        console.log(`✓ Created Firebase Auth user: ${created.uid}`);
        return { uid: created.uid, source: 'auth' };
      } catch (innerError: any) {
        if (innerError.code === 'auth/configuration-not-found') {
          console.warn(`⚠️ Firebase Auth is not yet initialized in Firebase Console for project 'bropics-app'.`);
          // Generate a deterministic UID based on phone number
          const deterministicUid = 'user_' + options.phoneNumber.replace(/[^0-9]/g, '');
          return { uid: deterministicUid, source: 'firestore-only' };
        }
        throw innerError;
      }
    } else if (error.code === 'auth/configuration-not-found') {
      console.warn(`⚠️ Firebase Auth is not yet initialized in Firebase Console for project 'bropics-app'.`);
      const deterministicUid = 'user_' + options.phoneNumber.replace(/[^0-9]/g, '');
      return { uid: deterministicUid, source: 'firestore-only' };
    }
    throw error;
  }
}

async function setupAdminUser(options: CreateUserOptions) {
  const { uid, source } = await getOrCreateAuthUser(options);
  const role = options.role ?? 'super_admin';

  if (source === 'auth') {
    // 1. Set custom claims for admin permissions
    await auth.setCustomUserClaims(uid, { role });
    console.log(`✓ Set custom claim { role: '${role}' } on UID: ${uid}`);
  }

  // 2. Create/update Firestore user doc
  const userDoc = UserSchema.parse({
    id: uid,
    phone: options.phoneNumber,
    email: options.email ?? null,
    displayName: options.displayName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    firstName: options.displayName.split(' ')[0] || null,
    lastName: options.displayName.split(' ').slice(1).join(' ') || null,
  });
  await db.collection('users').doc(uid).set(userDoc, { merge: true });
  console.log(`✓ Updated Firestore document /users/${uid}`);

  // 3. Create/update Firestore staff mirror doc
  const staffDoc = StaffMirrorSchema.parse({
    uid,
    role,
    active: true,
    invitedBy: 'system_seed',
    lastLoginAt: null,
    updatedAt: new Date(),
  });
  await db.collection('staff').doc(uid).set(staffDoc, { merge: true });
  console.log(`✓ Updated Firestore document /staff/${uid}`);

  return { uid, source };
}

async function setupCustomerUser(options: CreateUserOptions) {
  const { uid, source } = await getOrCreateAuthUser(options);

  if (source === 'auth') {
    // Clear any admin role claims if previously had one
    await auth.setCustomUserClaims(uid, {});
  }

  // 1. Create/update Firestore user doc
  const userDoc = UserSchema.parse({
    id: uid,
    phone: options.phoneNumber,
    email: options.email ?? null,
    displayName: options.displayName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    firstName: options.displayName.split(' ')[0] || null,
    lastName: options.displayName.split(' ').slice(1).join(' ') || null,
    totalSpent: 0,
    orderCount: 0,
  });
  await db.collection('users').doc(uid).set(userDoc, { merge: true });
  console.log(`✓ Updated Firestore document /users/${uid}`);

  // 2. Add test address if provided
  if (options.address) {
    const addressDoc = AddressSchema.parse({
      id: 'default',
      label: 'Home',
      line1: options.address.line1,
      line2: options.address.line2 ?? null,
      city: options.address.city,
      state: options.address.state,
      pincode: options.address.pincode,
      phone: options.phoneNumber,
      isDefault: true,
      type: 'home',
      country: 'India',
    });
    await db.collection('users').doc(uid).collection('addresses').doc('default').set(addressDoc, { merge: true });
    console.log(`✓ Created default address in /users/${uid}/addresses/default`);
  }

  return { uid, source };
}

async function main() {
  console.log('--- Setting up Admin & Test Customer Users ---');

  // 1. Admin User
  const admin = await setupAdminUser({
    phoneNumber: '+919999999999',
    displayName: 'Admin User',
    email: 'admin@bropics.com',
    role: 'super_admin',
  });

  // 2. Test Customer User
  const customer = await setupCustomerUser({
    phoneNumber: '+919888888888',
    displayName: 'Test Customer',
    email: 'customer@test.com',
    address: {
      line1: '123 Test Street, Anna Nagar',
      line2: 'Opposite Park',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600040',
    },
  });

  console.log('\n==================================================');
  console.log('✅ Users Created in Firestore Successfully!');
  console.log('==================================================');
  console.log('👑 Admin Account:');
  console.log(`   UID:   ${admin.uid}`);
  console.log(`   Phone: +91 99999 99999`);
  console.log(`   Role:  super_admin`);
  console.log('\n🛍️ Test Customer Account:');
  console.log(`   UID:   ${customer.uid}`);
  console.log(`   Phone: +91 98888 88888`);
  console.log('==================================================\n');

  if (admin.source === 'firestore-only') {
    console.log('📢 NEXT STEPS FOR OTP LOGIN IN FIREBASE CONSOLE:');
    console.log('1. Go to Firebase Console -> https://console.firebase.google.com/project/bropics-app/authentication');
    console.log('2. Click "Get started" to enable Authentication.');
    console.log('3. Under the "Sign-in method" tab, enable "Phone".');
    console.log('4. Under "Phone numbers for testing", add:');
    console.log('     Phone: +91 9999999999  |  OTP: 123456  (Admin)');
    console.log('     Phone: +91 9888888888  |  OTP: 123456  (Customer)');
    console.log('5. Once enabled, run `pnpm --filter @bro-pics/seed create-test-users` again to assign Admin claims directly in Auth!');
    console.log('==================================================\n');
  }
}

main().catch((err) => {
  console.error('Fatal error setting up users:', err);
  process.exit(1);
});

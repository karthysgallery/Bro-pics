import crypto from 'crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../firebase-admin';
import { normalizeIndianPhoneNumber } from './whatsapp/otp-store';

export interface UserRecord {
  id: string;
  phone: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  passwordHash?: string | null;
  whatsappVerified: boolean;
  emailVerified: boolean;
  role: 'customer' | 'staff' | 'admin' | 'super_admin';
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
}

// In production a Firestore/Auth failure must surface (routes turn it into a
// 503) — silently falling back to per-instance memory would create accounts
// that vanish on the next cold start and hand out fake custom tokens.
const isProduction = () => process.env.NODE_ENV === 'production';

// In-memory user store fallback for LOCAL DEV / TESTS only, where Firebase Admin is uninitialized/offline
const globalForUsers = globalThis as unknown as {
  _karthysUsersByPhone?: Map<string, UserRecord>;
  _karthysUsersById?: Map<string, UserRecord>;
};
const fallbackUsersByPhone =
  globalForUsers._karthysUsersByPhone ?? (globalForUsers._karthysUsersByPhone = new Map<string, UserRecord>());
const fallbackUsersById =
  globalForUsers._karthysUsersById ?? (globalForUsers._karthysUsersById = new Map<string, UserRecord>());

export class UserStore {
  /**
   * Finds a user by normalized phone number.
   */
  static async findByPhone(rawPhone: string): Promise<UserRecord | null> {
    const normalized = normalizeIndianPhoneNumber(rawPhone);

    // Try Firestore first if available
    try {
      const db = getFirestore(getAdminApp());
      const snap = await db.collection('users').where('phone', '==', normalized).limit(1).get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        const data = doc.data();
        const user: UserRecord = {
          id: doc.id,
          phone: data.phone || normalized,
          displayName: data.displayName || data.firstName || 'Customer',
          firstName: data.firstName || null,
          lastName: data.lastName || null,
          email: data.email || null,
          passwordHash: data.passwordHash || null,
          whatsappVerified: Boolean(data.whatsappVerified ?? true),
          emailVerified: Boolean(data.emailVerified),
          role: data.role || 'customer',
          status: data.disabled ? 'disabled' : 'active',
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
          lastLoginAt: data.lastLoginAt || null,
        };
        // Cache in fallback
        fallbackUsersByPhone.set(normalized, user);
        fallbackUsersById.set(user.id, user);
        return user;
      }
    } catch (err) {
      if (isProduction()) throw err;
      // Dev/test: AdminApp uninitialized or offline
    }

    return fallbackUsersByPhone.get(normalized) || null;
  }

  /**
   * Finds a user by ID.
   */
  static async findById(id: string): Promise<UserRecord | null> {
    try {
      const db = getFirestore(getAdminApp());
      const doc = await db.collection('users').doc(id).get();
      if (doc.exists) {
        const data = doc.data()!;
        return {
          id: doc.id,
          phone: data.phone,
          displayName: data.displayName || data.firstName || 'Customer',
          firstName: data.firstName || null,
          lastName: data.lastName || null,
          email: data.email || null,
          passwordHash: data.passwordHash || null,
          whatsappVerified: Boolean(data.whatsappVerified ?? true),
          emailVerified: Boolean(data.emailVerified),
          role: data.role || 'customer',
          status: data.disabled ? 'disabled' : 'active',
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
          lastLoginAt: data.lastLoginAt || null,
        };
      }
    } catch (err) {
      if (isProduction()) throw err;
      // Dev/test offline fallback
    }

    return fallbackUsersById.get(id) || null;
  }

  /**
   * Creates a new customer account after successful registration and OTP verification.
   */
  static async createCustomer(params: {
    phone: string;
    fullName: string;
    email?: string | null;
    passwordHash: string;
  }): Promise<{ user: UserRecord; customToken?: string }> {
    const normalized = normalizeIndianPhoneNumber(params.phone);
    const existing = await this.findByPhone(normalized);
    if (existing) {
      throw new Error('An account already exists with this WhatsApp number.');
    }

    const uid = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const trimmedName = params.fullName.trim();
    const parts = trimmedName.split(' ');
    const firstName = parts[0] || 'Customer';
    const lastName = parts.slice(1).join(' ') || null;

    const user: UserRecord = {
      id: uid,
      phone: normalized,
      displayName: trimmedName,
      firstName,
      lastName,
      email: params.email ? params.email.trim().toLowerCase() : null,
      passwordHash: params.passwordHash,
      whatsappVerified: true,
      emailVerified: false,
      role: 'customer',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    let customToken: string | undefined;

    // Persist to Firestore and Firebase Auth if available
    try {
      const adminApp = getAdminApp();
      const auth = getAuth(adminApp);
      const db = getFirestore(adminApp);

      // Create or link Firebase Auth record
      try {
        await auth.createUser({
          uid,
          phoneNumber: normalized,
          displayName: trimmedName,
          email: user.email || undefined,
        });
      } catch (authErr: any) {
        // If phone already exists in Firebase Auth, reuse that uid
        if (authErr?.code === 'auth/phone-number-already-exists') {
          const existingAuth = await auth.getUserByPhoneNumber(normalized);
          user.id = existingAuth.uid;
        }
      }

      await auth.setCustomUserClaims(user.id, { role: 'customer' });
      customToken = await auth.createCustomToken(user.id, { role: 'customer' });

      // Save user doc to Firestore /users/{uid}
      await db.collection('users').doc(user.id).set(
        {
          id: user.id,
          phone: user.phone,
          displayName: user.displayName,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          passwordHash: user.passwordHash,
          whatsappVerified: true,
          emailVerified: false,
          role: 'customer',
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.lastLoginAt,
        },
        { merge: true }
      );
    } catch (err) {
      if (isProduction()) throw err;
      // Dev/test offline mode only: generate a mock custom token
      customToken = `mock_custom_token_${user.id}`;
    }

    fallbackUsersByPhone.set(normalized, user);
    fallbackUsersById.set(user.id, user);

    return { user, customToken };
  }

  /**
   * The role a user effectively holds: the highest-privilege of the users
   * doc role and the Firebase Auth custom-claim role. The Auth claim is what
   * API authorization actually uses, so it must count even if the users doc
   * says 'customer' (or has no role at all).
   */
  static async getEffectiveRole(user: UserRecord): Promise<UserRecord['role'] | string> {
    if (user.role !== 'customer') return user.role;
    try {
      const authUser = await getAuth(getAdminApp()).getUser(user.id);
      const claimRole = (authUser.customClaims as { role?: string } | undefined)?.role;
      return claimRole && claimRole !== 'customer' ? claimRole : 'customer';
    } catch (err) {
      if (isProduction()) throw err;
      return user.role;
    }
  }

  /**
   * Updates lastLoginAt on login and returns a custom token for the client
   * to sign in with. Existing custom claims (role, staff, …) are carried
   * over into the token — minting {role:'customer'} for everyone would
   * clobber an admin's/staff member's role on sign-in.
   */
  static async recordLogin(userId: string): Promise<string | undefined> {
    const now = new Date().toISOString();
    let customToken: string | undefined;

    try {
      const adminApp = getAdminApp();
      const auth = getAuth(adminApp);
      const db = getFirestore(adminApp);

      await db.collection('users').doc(userId).set({ lastLoginAt: now, whatsappVerified: true }, { merge: true });
      let claims: Record<string, unknown> = { role: 'customer' };
      try {
        const authUser = await auth.getUser(userId);
        if (authUser.customClaims && Object.keys(authUser.customClaims).length > 0) {
          claims = { ...authUser.customClaims };
          if (typeof claims.role !== 'string') claims.role = 'customer';
        }
      } catch {
        // No Auth record yet (dev/seed data) — default customer claims apply.
      }
      customToken = await auth.createCustomToken(userId, claims);
    } catch (err) {
      if (isProduction()) throw err;
      customToken = `mock_custom_token_${userId}`;
    }

    const cached = fallbackUsersById.get(userId);
    if (cached) {
      cached.lastLoginAt = now;
      cached.whatsappVerified = true;
    }

    return customToken;
  }

  /**
   * Clears in-memory cache (for testing).
   */
  static reset(): void {
    fallbackUsersByPhone.clear();
    fallbackUsersById.clear();
  }
}

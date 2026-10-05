import crypto from 'crypto';

export interface OtpSessionRecord {
  phoneNumber: string;
  otpHash: string;
  salt: string;
  expiresAt: number; // Unix timestamp ms
  attempts: number;
  maxAttempts: number;
  resendCount: number;
  lastSentAt: number; // Unix timestamp ms
  purpose: 'login' | 'register' | 'verification';
  verified: boolean;
  verifiedAt?: number;
}

export const OTP_CONFIG = {
  LENGTH: 6,
  EXPIRY_SECONDS: 300, // 5 minutes
  COOLDOWN_SECONDS: 30, // 30 seconds before resend is allowed
  MAX_ATTEMPTS: 5,
  MAX_RESENDS: 3,
  // Resend count only accumulates within this window, so a customer who
  // tried a while ago isn't locked out forever by stale state.
  RESEND_WINDOW_SECONDS: 900, // 15 minutes
} as const;

/**
 * Normalizes any Indian mobile number string into canonical E.164 format: +91XXXXXXXXXX.
 * Throws an Error if the number cannot be normalized to a valid Indian mobile number.
 */
export function normalizeIndianPhoneNumber(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error('Please enter a valid WhatsApp mobile number.');
  }

  // Remove whitespace, dashes, parentheses, dots
  let cleaned = input.replace(/[\s\-\(\)\.]/g, '');

  // If starts with +91, strip +91 for validation
  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  // Indian mobile numbers must be exactly 10 digits starting with 6, 7, 8, or 9
  if (!/^[6-9]\d{9}$/.test(cleaned)) {
    throw new Error('Please enter a valid 10-digit Indian mobile number.');
  }

  return `+91${cleaned}`;
}

/**
 * Formats a phone number for user-friendly display, masking the middle digits.
 * Example: "+919876543210" -> "+91 XXXXX 3210"
 */
export function maskPhoneNumber(phone: string): string {
  try {
    const normalized = normalizeIndianPhoneNumber(phone);
    const last4 = normalized.slice(-4);
    return `+91 XXXXX ${last4}`;
  } catch {
    return phone;
  }
}

/**
 * Generates a cryptographically strong 6-digit OTP string.
 */
export function generateSecureOtp(): string {
  // Generate random integer between 100000 and 999999
  const buffer = crypto.randomBytes(4);
  const num = buffer.readUInt32BE(0) % 900000 + 100000;
  return num.toString();
}

/**
 * Hashes an OTP with a salt and phone number so plain OTPs are never stored.
 */
export function hashOtp(phone: string, otp: string, salt: string): string {
  return crypto
    .createHash('sha256')
    .update(`${phone}:${salt}:${otp}`)
    .digest('hex');
}

/**
 * Constant-time comparison to prevent timing attacks.
 */
export function verifyOtpHash(phone: string, otp: string, salt: string, expectedHash: string): boolean {
  const computedHash = hashOtp(phone, otp, salt);
  const a = Buffer.from(computedHash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Storage backends.
//
// OTP state MUST be shared across server instances: on serverless / multi-
// instance hosting, "send" and "verify" routinely land on different
// instances, and a per-process Map makes every verify fail with NOT_FOUND.
// So the store is async over a backend:
//   - FirestoreOtpBackend  -> production (otpSessions/{hash(phone)}, Admin SDK only)
//   - MemoryOtpBackend     -> local dev and tests
// Every read-modify-write goes through `mutate`, which Firestore runs inside
// a transaction — that is what makes the attempt counter safe against
// concurrent guesses.
// ---------------------------------------------------------------------------

export type OtpMutation<T> = { next: OtpSessionRecord | null; result: T };
export type OtpMutator<T> = (current: OtpSessionRecord | null) => OtpMutation<T>;

export interface OtpBackend {
  read(phone: string): Promise<OtpSessionRecord | null>;
  mutate<T>(phone: string, fn: OtpMutator<T>): Promise<T>;
  clear(): Promise<void>;
}

const globalForOtp = globalThis as unknown as { _karthysOtpStore?: Map<string, OtpSessionRecord> };
const memoryOtpStore =
  globalForOtp._karthysOtpStore ?? (globalForOtp._karthysOtpStore = new Map<string, OtpSessionRecord>());

export class MemoryOtpBackend implements OtpBackend {
  async read(phone: string) {
    return memoryOtpStore.get(phone) ?? null;
  }
  async mutate<T>(phone: string, fn: OtpMutator<T>): Promise<T> {
    const { next, result } = fn(memoryOtpStore.get(phone) ?? null);
    if (next) memoryOtpStore.set(phone, next);
    else memoryOtpStore.delete(phone);
    return result;
  }
  async clear() {
    memoryOtpStore.clear();
  }
}

const OTP_COLLECTION = 'otpSessions';

function otpDocId(phone: string): string {
  // The phone number never appears in a document id.
  return crypto.createHash('sha256').update(phone).digest('hex').slice(0, 40);
}

export class FirestoreOtpBackend implements OtpBackend {
  private async db() {
    // Lazy imports keep firebase-admin out of anything that only needs the
    // pure helpers above (and out of the memory/test path entirely).
    const [{ getFirestore }, { getAdminApp }] = await Promise.all([
      import('firebase-admin/firestore'),
      import('../../firebase-admin'),
    ]);
    return getFirestore(getAdminApp());
  }

  async read(phone: string) {
    const snap = (await this.db()).collection(OTP_COLLECTION).doc(otpDocId(phone)).get();
    const doc = await snap;
    return doc.exists ? (doc.data() as OtpSessionRecord) : null;
  }

  async mutate<T>(phone: string, fn: OtpMutator<T>): Promise<T> {
    const db = await this.db();
    const ref = db.collection(OTP_COLLECTION).doc(otpDocId(phone));
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const { next, result } = fn(snap.exists ? (snap.data() as OtpSessionRecord) : null);
      if (next) {
        // `expireAt` is for a Firestore TTL policy on this collection group
        // (configure in the console: otpSessions.expireAt) so abandoned
        // sessions don't accumulate. Correctness never depends on it —
        // verify() checks expiresAt itself.
        tx.set(ref, { ...next, expireAt: new Date(next.expiresAt + 24 * 60 * 60 * 1000) });
      } else {
        tx.delete(ref);
      }
      return result;
    });
  }

  async clear() {
    throw new Error('FirestoreOtpBackend.clear is test-only and intentionally unsupported');
  }
}

let backendOverride: OtpBackend | null = null;
let cachedBackend: OtpBackend | null = null;

/** Test hook: force a backend (or null to restore env-based selection). */
export function setOtpBackendForTesting(backend: OtpBackend | null): void {
  backendOverride = backend;
  cachedBackend = null;
}

function getBackend(): OtpBackend {
  if (backendOverride) return backendOverride;
  if (cachedBackend) return cachedBackend;
  const explicit = (process.env.OTP_STORE || '').toLowerCase();
  const useFirestore =
    explicit === 'firestore' || (explicit !== 'memory' && process.env.NODE_ENV === 'production');
  cachedBackend = useFirestore ? new FirestoreOtpBackend() : new MemoryOtpBackend();
  return cachedBackend;
}

export type OtpVerifyResult = {
  success: boolean;
  error?: string;
  code?: 'INVALID_OTP' | 'EXPIRED_OTP' | 'TOO_MANY_ATTEMPTS' | 'NOT_FOUND';
};

export class OtpStore {
  /**
   * Creates or overwrites an OTP session for the phone number.
   * If an old OTP existed, it is completely invalidated.
   */
  static async createSession(
    phoneNumber: string,
    otp: string,
    purpose: 'login' | 'register' | 'verification' = 'login'
  ): Promise<OtpSessionRecord> {
    const normalized = normalizeIndianPhoneNumber(phoneNumber);
    const salt = crypto.randomBytes(16).toString('hex');
    const otpHash = hashOtp(normalized, otp, salt);
    const now = Date.now();

    return getBackend().mutate(normalized, (existing) => {
      const record: OtpSessionRecord = {
        phoneNumber: normalized,
        otpHash,
        salt,
        expiresAt: now + OTP_CONFIG.EXPIRY_SECONDS * 1000,
        attempts: 0,
        maxAttempts: OTP_CONFIG.MAX_ATTEMPTS,
        resendCount:
          existing && now - existing.lastSentAt < OTP_CONFIG.RESEND_WINDOW_SECONDS * 1000 ? existing.resendCount + 1 : 0,
        lastSentAt: now,
        purpose,
        verified: false,
      };
      return { next: record, result: record };
    });
  }

  /**
   * Retrieves active session record for a phone number.
   */
  static async getSession(phoneNumber: string): Promise<OtpSessionRecord | null> {
    try {
      return await getBackend().read(normalizeIndianPhoneNumber(phoneNumber));
    } catch {
      return null;
    }
  }

  /**
   * Verifies an OTP against the stored session record. The attempt counter
   * is incremented atomically with the check, so concurrent guesses cannot
   * exceed maxAttempts.
   */
  static async verify(phoneNumber: string, inputOtp: string): Promise<OtpVerifyResult> {
    let normalized: string;
    try {
      normalized = normalizeIndianPhoneNumber(phoneNumber);
    } catch {
      return { success: false, error: 'Please enter a valid WhatsApp mobile number.', code: 'INVALID_OTP' };
    }

    return getBackend().mutate<OtpVerifyResult>(normalized, (session) => {
      if (!session || session.verified) {
        return {
          next: session,
          result: { success: false, error: 'No active OTP verification found. Please request a new code.', code: 'NOT_FOUND' },
        };
      }

      if (Date.now() > session.expiresAt) {
        return { next: null, result: { success: false, error: 'This code has expired. Request a new code.', code: 'EXPIRED_OTP' } };
      }

      if (session.attempts >= session.maxAttempts) {
        return { next: null, result: { success: false, error: 'Too many attempts. Please request a new code.', code: 'TOO_MANY_ATTEMPTS' } };
      }

      const attempts = session.attempts + 1;
      const isValid = verifyOtpHash(normalized, inputOtp.trim(), session.salt, session.otpHash);
      if (!isValid) {
        if (attempts >= session.maxAttempts) {
          return { next: null, result: { success: false, error: 'Too many attempts. Please request a new code.', code: 'TOO_MANY_ATTEMPTS' } };
        }
        return {
          next: { ...session, attempts },
          result: { success: false, error: "That code isn't correct. Please try again.", code: 'INVALID_OTP' },
        };
      }

      // One-time use: the session is deleted on success so the code can't be replayed.
      return { next: null, result: { success: true } };
    });
  }

  /**
   * Checks whether the user is in cooldown for resending.
   */
  static async checkCooldown(phoneNumber: string): Promise<{ canResend: boolean; remainingSeconds: number }> {
    try {
      const normalized = normalizeIndianPhoneNumber(phoneNumber);
      const session = await getBackend().read(normalized);
      if (!session) return { canResend: true, remainingSeconds: 0 };

      const elapsed = Math.floor((Date.now() - session.lastSentAt) / 1000);
      if (elapsed < OTP_CONFIG.COOLDOWN_SECONDS) {
        return { canResend: false, remainingSeconds: OTP_CONFIG.COOLDOWN_SECONDS - elapsed };
      }
      return { canResend: true, remainingSeconds: 0 };
    } catch {
      return { canResend: false, remainingSeconds: 0 };
    }
  }

  /**
   * Resets / clears store (tests only).
   */
  static async reset(): Promise<void> {
    await getBackend().clear();
  }
}

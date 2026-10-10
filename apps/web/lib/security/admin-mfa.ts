import 'server-only';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { generateSecret, otpauthUri, stepAt, verifyTotp } from './totp';
import { createSessionToken, getSessionFromRequest, getSessionSecret, type SessionData } from '../services/session';

/**
 * Authenticator-app (TOTP) second step for every staff and admin account.
 *
 *  - The secret lives in `staffMfa/{uid}` (deny-all to every browser), encrypted with AES-256-GCM under a
 *    key derived from SESSION_SECRET — the database alone never reveals it.
 *  - After a correct code, the session cookie (`__session`, HttpOnly — the only cookie Firebase Hosting passes
 *    on) carries a signed proof for 12 hours. requirePermission refuses every admin/staff API call without it.
 *  - A code can be used once (its time step is remembered); 5 wrong codes lock the account for 15 minutes.
 *  - 10 one-time recovery codes, stored only as hashes, for a lost phone.
 *  - Resetting an account (team page or the owner's script) bumps `version`, which voids every proof at once.
 *
 * Do not rotate SESSION_SECRET without re-enrolling staff: the stored secrets are encrypted under it.
 */

export const MFA_COLLECTION = 'staffMfa';
export const MFA_SESSION_HOURS = 12;
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;
export const ISSUER = 'KarthysGallery Admin';

export interface MfaRecord {
  uid: string;
  /** Encrypted secret once enrolment is confirmed. */
  secret: string | null;
  /** Encrypted secret waiting for the first correct code. */
  pendingSecret: string | null;
  pendingAt: string | null;
  enabledAt: string | null;
  lastStep: number | null;
  /** HMAC hashes of unused recovery codes. */
  recovery: string[];
  failures: number;
  lockedUntil: string | null;
  version: number;
  updatedAt: string;
}

/** Off only in unit tests (NODE_ENV=test with ADMIN_MFA=off); always on in production. */
export function mfaEnforced(): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  return process.env.ADMIN_MFA !== 'off';
}

const key = (label: string) => createHmac('sha256', getSessionSecret()).update(`karthys-admin-mfa:${label}`).digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key('secret-v1'), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')}`;
}

export function decryptSecret(stored: string): string {
  const raw = Buffer.from(stored.replace(/^v1\./, ''), 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key('secret-v1'), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

const hashRecovery = (code: string) => createHmac('sha256', key('recovery-v1')).update(code.toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('base64url');

function newRecoveryCodes(): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid misreading
  return Array.from({ length: 10 }, () => {
    const bytes = randomBytes(8);
    const s = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

const empty = (uid: string, now: Date): MfaRecord => ({
  uid, secret: null, pendingSecret: null, pendingAt: null, enabledAt: null, lastStep: null, recovery: [], failures: 0, lockedUntil: null, version: 1, updatedAt: now.toISOString(),
});

export async function readMfa(db: Firestore, uid: string): Promise<MfaRecord | null> {
  const snap = await db.collection(MFA_COLLECTION).doc(uid).get();
  return snap.exists ? (snap.data() as MfaRecord) : null;
}

// --- The proof in the session cookie ----------------------------------------------------------------------

const versionCache = new Map<string, { v: number | null; at: number }>();
/** The account's current version (cached briefly so every admin request is not an extra read). */
async function currentVersion(db: Firestore, uid: string): Promise<number | null> {
  const hit = versionCache.get(uid);
  if (hit && Date.now() - hit.at < 30_000) return hit.v;
  const rec = await readMfa(db, uid);
  const v = rec?.secret ? rec.version : null;
  versionCache.set(uid, { v, at: Date.now() });
  return v;
}
export function forgetMfaCache(uid: string) {
  versionCache.delete(uid);
}

/** True when this request's session cookie proves `uid` entered a valid code within the last 12 hours. */
export async function hasMfaProof(db: Firestore, request: Request, uid: string): Promise<boolean> {
  const proof = getSessionFromRequest(request)?.adminMfa;
  if (!proof || proof.uid !== uid || proof.until < Date.now()) return false;
  return (await currentVersion(db, uid)) === proof.v;
}

/** The session cookie value carrying a fresh proof (keeping the customer session fields if there is one). */
export function sessionWithProof(request: Request, user: { uid: string; phone: string; role: string; name?: string }, version: number): string {
  const existing = getSessionFromRequest(request);
  const base: Omit<SessionData, 'expiresAt'> =
    existing && existing.userId === user.uid
      ? { ...existing }
      : { userId: user.uid, phone: user.phone, role: user.role, status: 'active', ...(user.name && { name: user.name }) };
  delete (base as Partial<SessionData>).expiresAt;
  return createSessionToken({ ...base, adminMfa: { uid: user.uid, until: Date.now() + MFA_SESSION_HOURS * 3600_000, v: version } });
}

/** The session cookie without the proof (signing out of the admin). */
export function sessionWithoutProof(request: Request): string | null {
  const existing = getSessionFromRequest(request);
  if (!existing) return null;
  const { expiresAt: _e, adminMfa: _m, ...rest } = existing;
  return createSessionToken(rest);
}

// --- Enrolment and verification ---------------------------------------------------------------------------

export class MfaError extends Error {
  constructor(
    readonly status: 400 | 409 | 423,
    message: string
  ) {
    super(message);
  }
}

/** Starts (or restarts) enrolment: a new secret, shown once as a QR code and a typed key. */
export async function startEnrolment(db: Firestore, uid: string, account: string, now = new Date()) {
  const ref = db.collection(MFA_COLLECTION).doc(uid);
  const current = (await ref.get()).data() as MfaRecord | undefined;
  if (current?.secret) throw new MfaError(409, 'An authenticator app is already set up for this account. Ask the owner to reset it to set up a new one.');
  const secret = generateSecret();
  await ref.set({ ...(current ?? empty(uid, now)), pendingSecret: encryptSecret(secret), pendingAt: now.toISOString(), updatedAt: now.toISOString() });
  return { secret, uri: otpauthUri(ISSUER, account, secret) };
}

/** Confirms enrolment with the first code from the app. Returns the recovery codes (shown once). */
export async function confirmEnrolment(db: Firestore, uid: string, code: string, now = new Date()) {
  const ref = db.collection(MFA_COLLECTION).doc(uid);
  return db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data() as MfaRecord | undefined;
    if (!rec?.pendingSecret) throw new MfaError(400, 'Start the set-up again: scan a new QR code.');
    if (rec.pendingAt && now.getTime() - Date.parse(rec.pendingAt) > 15 * 60_000) throw new MfaError(400, 'The QR code has expired. Start the set-up again.');
    const secret = decryptSecret(rec.pendingSecret);
    const step = verifyTotp(secret, code, now.getTime());
    if (step === null) throw new MfaError(400, 'That code is not right. Check the time on your phone is automatic, and type the code currently shown.');
    const codes = newRecoveryCodes();
    const next: MfaRecord = {
      ...rec, secret: rec.pendingSecret, pendingSecret: null, pendingAt: null, enabledAt: now.toISOString(), lastStep: step,
      recovery: codes.map(hashRecovery), failures: 0, lockedUntil: null, version: (rec.version ?? 0) + 1, updatedAt: now.toISOString(),
    };
    tx.set(ref, next);
    forgetMfaCache(uid);
    return { recoveryCodes: codes, version: next.version };
  });
}

/** Checks a 6-digit code (or a recovery code) for sign-in, with replay protection and lockout. */
export async function verifyCode(db: Firestore, uid: string, input: string, now = new Date()): Promise<{ version: number; usedRecovery: boolean; recoveryLeft: number }> {
  const ref = db.collection(MFA_COLLECTION).doc(uid);
  const result = await db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data() as MfaRecord | undefined;
    if (!rec?.secret) throw new MfaError(400, 'No authenticator app is set up for this account yet.');
    if (rec.lockedUntil && Date.parse(rec.lockedUntil) > now.getTime()) {
      const mins = Math.ceil((Date.parse(rec.lockedUntil) - now.getTime()) / 60_000);
      throw new MfaError(423, `Too many wrong codes. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
    }
    const trimmed = input.trim();
    let ok = false;
    let usedRecovery = false;
    let lastStep = rec.lastStep;
    let recovery = rec.recovery;
    if (/^\d{6}$/.test(trimmed.replace(/\s/g, ''))) {
      const step = verifyTotp(decryptSecret(rec.secret), trimmed, now.getTime(), rec.lastStep);
      if (step !== null) {
        ok = true;
        lastStep = step;
      }
    } else {
      const h = hashRecovery(trimmed);
      const hit = rec.recovery.find((r) => r.length === h.length && timingSafeEqual(Buffer.from(r), Buffer.from(h)));
      if (hit) {
        ok = true;
        usedRecovery = true;
        recovery = rec.recovery.filter((r) => r !== hit);
      }
    }
    if (!ok) {
      const failures = (rec.failures ?? 0) + 1;
      const locked = failures >= MAX_FAILURES;
      tx.update(ref, { failures: locked ? 0 : failures, lockedUntil: locked ? new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString() : rec.lockedUntil, updatedAt: now.toISOString() });
      return { ok: false as const, locked, left: MAX_FAILURES - failures };
    }
    tx.update(ref, { failures: 0, lockedUntil: null, lastStep, recovery, updatedAt: now.toISOString() });
    return { ok: true as const, version: rec.version, usedRecovery, recoveryLeft: recovery.length };
  });
  if (!result.ok) {
    throw new MfaError(result.locked ? 423 : 400, result.locked ? `Too many wrong codes. Try again in ${LOCK_MINUTES} minutes.` : `That code is not right. ${result.left} tr${result.left === 1 ? 'y' : 'ies'} left before a ${LOCK_MINUTES}-minute lock.`);
  }
  return { version: result.version, usedRecovery: result.usedRecovery, recoveryLeft: result.recoveryLeft };
}

/** Removes an account's authenticator (lost phone): it must set one up again at its next sign-in. */
export async function resetMfa(db: Firestore, uid: string, now = new Date()): Promise<void> {
  const ref = db.collection(MFA_COLLECTION).doc(uid);
  const rec = (await ref.get()).data() as MfaRecord | undefined;
  await ref.set({ ...empty(uid, now), version: (rec?.version ?? 0) + 1 });
  forgetMfaCache(uid);
}

/** Current step (exported for the clock-drift message). */
export const nowStep = () => stepAt(Date.now());

import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { MFA_COLLECTION, MfaError, readMfa } from './admin-mfa';
import { MAX_PASSKEYS, PASSKEYS, PASSKEY_CHALLENGES, listPasskeys, type PasskeyRecord } from './passkey-store';

/**
 * Fingerprint / Face ID (a "passkey") as the second sign-in step, instead of typing the authenticator-app code.
 *
 *  - Only an account that already passed the authenticator step can add one, and only an account WITH an
 *    authenticator set up can use one: the app code and the recovery codes stay the fallback for a lost phone.
 *  - The phone/laptop keeps the private key behind its fingerprint or face check; the server stores only the public key.
 *    Every sign-in is a fresh signed challenge (single use, 5 minutes), bound to this website's address, and the
 *    device must confirm the person (fingerprint, face or screen lock): "user verification" is required.
 *  - A passkey works on one website address only (the browser enforces it). Moving the shop to its own domain means
 *    adding the passkey again there; the app code works everywhere.
 *  - Resetting an account removes its passkeys (see resetMfa).
 */

export const RP_NAME = 'KarthysGallery Admin';
const CHALLENGE_MINUTES = 5;

/** The website addresses a passkey may be used on: the shop's own address(es), plus localhost outside production. */
export function allowedOrigins(): string[] {
  const list = new Set<string>(['https://karthysgallery.in', 'https://www.karthysgallery.in', 'https://bropics-app.web.app', 'https://bropics-app.firebaseapp.com']);
  try {
    if (process.env.NEXT_PUBLIC_SITE_URL) list.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
  } catch {
    /* an unusable setting adds nothing */
  }
  if (process.env.NODE_ENV !== 'production') ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3100'].forEach((o) => list.add(o));
  return [...list];
}

/** The address this request came from, when it is one of the allowed ones. */
export function relyingParty(request: Request): { rpID: string; origin: string } {
  const fromHeader = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  const origin = fromHeader ?? (host ? `${proto}://${host}` : '');
  if (!allowedOrigins().includes(origin)) throw new MfaError(400, 'Fingerprint and Face ID cannot be used on this web address. Use the code from your authenticator app.');
  return { rpID: new URL(origin).hostname, origin };
}

interface StoredChallenge {
  value: string;
  kind: 'register' | 'login';
  rpID: string;
  origin: string;
  expiresAt: string;
}

async function saveChallenge(db: Firestore, uid: string, c: Omit<StoredChallenge, 'expiresAt'>, now: Date): Promise<void> {
  await db.collection(PASSKEY_CHALLENGES).doc(uid).set({ ...c, expiresAt: new Date(now.getTime() + CHALLENGE_MINUTES * 60_000).toISOString() });
}

/** Reads and removes the pending challenge in one step: each challenge can be answered once. */
async function takeChallenge(db: Firestore, uid: string, kind: StoredChallenge['kind'], now: Date): Promise<StoredChallenge> {
  const ref = db.collection(PASSKEY_CHALLENGES).doc(uid);
  const got = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) tx.delete(ref);
    return snap.exists ? (snap.data() as StoredChallenge) : null;
  });
  if (!got || got.kind !== kind || Date.parse(got.expiresAt) < now.getTime()) throw new MfaError(400, 'That took too long or was already used. Try again.');
  return got;
}

const toB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

async function requireAuthenticator(db: Firestore, uid: string): Promise<number> {
  const rec = await readMfa(db, uid);
  if (!rec?.secret) throw new MfaError(400, 'Set up your authenticator app first.');
  return rec.version;
}

// --- Adding a fingerprint / Face ID -----------------------------------------------------------------------

export async function beginRegistration(db: Firestore, request: Request, uid: string, account: string, now = new Date()): Promise<PublicKeyCredentialCreationOptionsJSON> {
  await requireAuthenticator(db, uid);
  const { rpID, origin } = relyingParty(request);
  const existing = await listPasskeys(db, uid);
  if (existing.length >= MAX_PASSKEYS) throw new MfaError(409, `You can add up to ${MAX_PASSKEYS} devices. Remove one first.`);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: account,
    userDisplayName: account,
    userID: new TextEncoder().encode(uid),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    timeout: CHALLENGE_MINUTES * 60_000,
  });
  await saveChallenge(db, uid, { value: options.challenge, kind: 'register', rpID, origin }, now);
  return options;
}

export async function finishRegistration(db: Firestore, uid: string, response: RegistrationResponseJSON, name: string, now = new Date()): Promise<PasskeyRecord> {
  await requireAuthenticator(db, uid);
  const ch = await takeChallenge(db, uid, 'register', now);
  let verification;
  try {
    verification = await verifyRegistrationResponse({ response, expectedChallenge: ch.value, expectedOrigin: ch.origin, expectedRPID: ch.rpID, requireUserPresence: true, requireUserVerification: true });
  } catch {
    throw new MfaError(400, 'This device could not be added. Try again, and confirm with your fingerprint, face or screen lock when asked.');
  }
  if (!verification.verified || !verification.registrationInfo) throw new MfaError(400, 'This device could not be added. Try again.');
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const ref = db.collection(PASSKEYS).doc(credential.id);
  if ((await ref.get()).exists) throw new MfaError(409, 'This device is already added.');
  if ((await listPasskeys(db, uid)).length >= MAX_PASSKEYS) throw new MfaError(409, `You can add up to ${MAX_PASSKEYS} devices. Remove one first.`);
  const record: PasskeyRecord = {
    id: credential.id,
    uid,
    publicKey: toB64(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    name: name.replace(/[<>]/g, '').trim().slice(0, 40) || 'This device',
    createdAt: now.toISOString(),
    lastUsedAt: null,
  };
  await ref.set(record);
  return record;
}

// --- Signing in with it -----------------------------------------------------------------------------------

export async function beginLogin(db: Firestore, request: Request, uid: string, now = new Date()): Promise<PublicKeyCredentialRequestOptionsJSON> {
  await requireAuthenticator(db, uid);
  const { rpID, origin } = relyingParty(request);
  const passkeys = await listPasskeys(db, uid);
  if (passkeys.length === 0) throw new MfaError(400, 'No fingerprint or Face ID is set up for this account. Use the code from your authenticator app.');
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: passkeys.map((p) => ({ id: p.id, transports: p.transports })),
    userVerification: 'required',
    timeout: CHALLENGE_MINUTES * 60_000,
  });
  await saveChallenge(db, uid, { value: options.challenge, kind: 'login', rpID, origin }, now);
  return options;
}

/** Checks the signed answer and returns the account's authenticator version (for the session proof). */
export async function finishLogin(db: Firestore, uid: string, response: AuthenticationResponseJSON, now = new Date()): Promise<{ version: number; name: string }> {
  const version = await requireAuthenticator(db, uid);
  const ch = await takeChallenge(db, uid, 'login', now);
  const ref = db.collection(PASSKEYS).doc(response.id);
  const stored = (await ref.get()).data() as PasskeyRecord | undefined;
  // A credential of another account is never accepted here.
  if (!stored || stored.uid !== uid) throw new MfaError(400, 'This device is not set up for your account. Use the code from your authenticator app.');
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.value,
      expectedOrigin: ch.origin,
      expectedRPID: ch.rpID,
      credential: { id: stored.id, publicKey: fromB64(stored.publicKey), counter: stored.counter, transports: stored.transports as never },
      requireUserVerification: true,
    });
  } catch {
    throw new MfaError(400, 'That did not work. Try again, or use the code from your authenticator app.');
  }
  if (!verification.verified) throw new MfaError(400, 'That did not work. Try again, or use the code from your authenticator app.');
  await ref.update({ counter: verification.authenticationInfo.newCounter, lastUsedAt: now.toISOString() });
  return { version, name: stored.name };
}

// --- Managing them ----------------------------------------------------------------------------------------

export async function removePasskey(db: Firestore, uid: string, id: string): Promise<boolean> {
  const ref = db.collection(PASSKEYS).doc(id);
  const snap = await ref.get();
  if (!snap.exists || (snap.data() as PasskeyRecord).uid !== uid) return false;
  await ref.delete();
  return true;
}

/** What the page may show about a passkey (never the key itself). */
export const publicPasskey = (p: PasskeyRecord) => ({ id: p.id, name: p.name, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt, deviceType: p.deviceType, backedUp: p.backedUp });

export { MFA_COLLECTION };

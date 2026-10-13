import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';

/** staffPasskeys/{credentialId}: one fingerprint / Face ID / device key of a staff account. Deny-all to every browser. */
export const PASSKEYS = 'staffPasskeys';
/** staffPasskeyChallenges/{uid}: the one pending challenge of an account (single use, 5 minutes). Deny-all to every browser. */
export const PASSKEY_CHALLENGES = 'staffPasskeyChallenges';
export const MAX_PASSKEYS = 10;

export interface PasskeyRecord {
  /** The credential id (base64url): also the document id. */
  id: string;
  uid: string;
  /** The public key (base64url). The private key never leaves the person's device. */
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listPasskeys(db: Firestore, uid: string): Promise<PasskeyRecord[]> {
  const snap = await db.collection(PASSKEYS).where('uid', '==', uid).get();
  return snap.docs.map((d) => d.data() as PasskeyRecord).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Removes every passkey of an account (the authenticator was reset: a lost or stolen phone must not stay trusted). */
export async function deleteAllPasskeys(db: Firestore, uid: string): Promise<number> {
  const snap = await db.collection(PASSKEYS).where('uid', '==', uid).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(db.collection(PASSKEY_CHALLENGES).doc(uid));
  await batch.commit();
  return snap.size;
}

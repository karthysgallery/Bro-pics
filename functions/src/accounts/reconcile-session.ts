import { mergeCartItems, type CartLine } from '@bro-pics/shared';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

export interface ReconciliationTransaction {
  getUploadsBySessionId(sessionId: string): Promise<Array<{ id: string }>>;
  getCustomizationsBySessionId(sessionId: string): Promise<Array<{ id: string }>>;
  setUploadUserId(uploadId: string, userId: string): void;
  setCustomizationUserId(customizationId: string, userId: string): void;
  getCart(userId: string): Promise<{ items: CartLine[] } | undefined>;
  setCart(userId: string, cart: { items: CartLine[] }): void;
  userExists(userId: string): Promise<boolean>;
  upsertUser(userId: string, phone: string, isNewUser: boolean): void;
}

export interface ReconciliationParams {
  sessionId: string;
  userId: string;
  phone: string;
  incomingCartItems: CartLine[];
}

/**
 * Reassigns session-owned uploads/customizations to the logged-in user,
 * merges the client's local cart into carts/{userId}, and upserts the user
 * profile — all through the transaction interface below, so the real
 * Cloud Function (reconcileSessionOnLogin) can run this inside a real
 * Firestore transaction (all-or-nothing) while this function itself stays
 * unit-testable with fakes, same pattern as generateOrderNo/
 * isDuplicateWebhookEvent.
 */
export async function runReconciliation(
  tx: ReconciliationTransaction,
  params: ReconciliationParams
): Promise<void> {
  const { sessionId, userId, phone, incomingCartItems } = params;

  // Firestore transactions require every read to happen before any write —
  // all four reads run first, and only then do the writes below fire.
  const uploads = await tx.getUploadsBySessionId(sessionId);
  const customizations = await tx.getCustomizationsBySessionId(sessionId);
  const existingCart = await tx.getCart(userId);
  const isNewUser = !(await tx.userExists(userId));

  for (const upload of uploads) tx.setUploadUserId(upload.id, userId);
  for (const customization of customizations) tx.setCustomizationUserId(customization.id, userId);

  const mergedItems = mergeCartItems(existingCart?.items ?? [], incomingCartItems);
  tx.setCart(userId, { items: mergedItems });

  tx.upsertUser(userId, phone, isNewUser);
}

function buildAdminTransaction(
  db: FirebaseFirestore.Firestore,
  transaction: FirebaseFirestore.Transaction
): ReconciliationTransaction {
  return {
    async getUploadsBySessionId(sessionId) {
      const snapshot = await transaction.get(db.collection('uploads').where('sessionId', '==', sessionId));
      return snapshot.docs.map((doc) => ({ id: doc.id }));
    },
    async getCustomizationsBySessionId(sessionId) {
      const snapshot = await transaction.get(db.collection('customizations').where('sessionId', '==', sessionId));
      return snapshot.docs.map((doc) => ({ id: doc.id }));
    },
    setUploadUserId(uploadId, userId) {
      transaction.update(db.collection('uploads').doc(uploadId), { userId });
    },
    setCustomizationUserId(customizationId, userId) {
      transaction.update(db.collection('customizations').doc(customizationId), { userId });
    },
    async getCart(userId) {
      const doc = await transaction.get(db.collection('carts').doc(userId));
      return doc.exists ? (doc.data() as { items: CartLine[] }) : undefined;
    },
    setCart(userId, cart) {
      transaction.set(db.collection('carts').doc(userId), cart);
    },
    async userExists(userId) {
      const doc = await transaction.get(db.collection('users').doc(userId));
      return doc.exists;
    },
    upsertUser(userId, phone, isNewUser) {
      const now = new Date().toISOString();
      const payload: Record<string, unknown> = { phone, updatedAt: now };
      if (isNewUser) payload.createdAt = now;
      transaction.set(db.collection('users').doc(userId), payload, { merge: true });
    },
  };
}

export const reconcileSessionOnLogin = onCall(async (request) => {
  const userId = request.auth?.uid;
  const phone = request.auth?.token.phone_number;
  if (!userId || !phone) {
    throw new HttpsError('unauthenticated', 'Must be signed in with a verified phone number.');
  }

  const { sessionId, cartItems } = request.data as { sessionId?: string; cartItems?: CartLine[] };
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new HttpsError('invalid-argument', 'Missing sessionId.');
  }

  const db = getFirestore();
  await db.runTransaction(async (transaction) => {
    const tx = buildAdminTransaction(db, transaction);
    await runReconciliation(tx, { sessionId, userId, phone, incomingCartItems: cartItems ?? [] });
  });
});

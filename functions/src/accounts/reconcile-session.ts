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
  /**
   * Idempotency guard, same pattern as isDuplicateWebhookEvent: a
   * reconciliationId is a stable key for one reconciliation *attempt*
   * (the client reuses it across retries of the same attempt — see
   * reconciliationId in ReconciliationParams below). Returns true if this
   * id was already processed by a prior transaction commit.
   */
  isReconciliationProcessed(reconciliationId: string): Promise<boolean>;
  /** Same pattern as markWebhookProcessed — written atomically with the rest of this transaction's writes. */
  markReconciliationProcessed(reconciliationId: string): void;
}

export interface ReconciliationParams {
  sessionId: string;
  userId: string;
  phone: string;
  incomingCartItems: CartLine[];
  /**
   * A key identifying this reconciliation *attempt*, stable across client
   * retries of the same underlying local-cart state (the client derives it
   * from sessionId, which itself only rotates after a successful
   * reconcile — see resetSessionId in apps/web/lib/session-id.ts). This is
   * what makes retries safe: an ordinary network drop between the server
   * committing this transaction and the client receiving the response is a
   * ordinary Cloud Functions failure mode, not a rare edge case, and
   * without an idempotency key a client-side retry would re-run
   * mergeCartItems against an already-merged server cart and double every
   * quantity, permanently and compoundingly (each further retry doubling
   * again).
   */
  reconciliationId: string;
}

/**
 * Reassigns session-owned uploads/customizations to the logged-in user,
 * merges the client's local cart into carts/{userId}, and upserts the user
 * profile — all through the transaction interface below, so the real
 * Cloud Function (reconcileSessionOnLogin) can run this inside a real
 * Firestore transaction (all-or-nothing) while this function itself stays
 * unit-testable with fakes, same pattern as generateOrderNo/
 * isDuplicateWebhookEvent.
 *
 * Idempotent per reconciliationId: if this id was already processed (the
 * server committed successfully on a prior attempt but the client never
 * learned that, e.g. the response was lost after commit), this is a no-op
 * that still resolves successfully — the caller gets a successful
 * resolution on retry with no double-write, exactly the guarantee
 * isDuplicateWebhookEvent/markWebhookProcessed gives Razorpay webhook
 * retries.
 */
export async function runReconciliation(
  tx: ReconciliationTransaction,
  params: ReconciliationParams
): Promise<void> {
  const { sessionId, userId, phone, incomingCartItems, reconciliationId } = params;

  // Firestore transactions require every read to happen before any write —
  // every read (including the idempotency check) runs first, and only
  // then do the writes below fire.
  const alreadyProcessed = await tx.isReconciliationProcessed(reconciliationId);
  const uploads = await tx.getUploadsBySessionId(sessionId);
  const customizations = await tx.getCustomizationsBySessionId(sessionId);
  const existingCart = await tx.getCart(userId);
  const isNewUser = !(await tx.userExists(userId));

  if (alreadyProcessed) {
    // Everything this reconciliationId was meant to do already happened in
    // an earlier commit. Skip every write below (reassignment, cart merge,
    // user upsert) — re-running them would reassign already-reassigned
    // uploads (harmless but pointless) and, critically, would merge
    // incomingCartItems into a cart that already includes them, doubling
    // quantities. Resolving without writing anything is what makes this
    // safe to retry indefinitely.
    return;
  }

  for (const upload of uploads) tx.setUploadUserId(upload.id, userId);
  for (const customization of customizations) tx.setCustomizationUserId(customization.id, userId);

  const mergedItems = mergeCartItems(existingCart?.items ?? [], incomingCartItems);
  tx.setCart(userId, { items: mergedItems });

  tx.upsertUser(userId, phone, isNewUser);
  tx.markReconciliationProcessed(reconciliationId);
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
    async isReconciliationProcessed(reconciliationId) {
      const doc = await transaction.get(db.collection('reconciliations').doc(reconciliationId));
      return doc.exists;
    },
    markReconciliationProcessed(reconciliationId) {
      transaction.set(db.collection('reconciliations').doc(reconciliationId), {
        processedAt: new Date().toISOString(),
      });
    },
  };
}

export const reconcileSessionOnLogin = onCall(async (request) => {
  const userId = request.auth?.uid;
  const phone = request.auth?.token.phone_number;
  if (!userId || !phone) {
    throw new HttpsError('unauthenticated', 'Must be signed in with a verified phone number.');
  }

  const { sessionId, cartItems, reconciliationId } = request.data as {
    sessionId?: string;
    cartItems?: CartLine[];
    reconciliationId?: string;
  };
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new HttpsError('invalid-argument', 'Missing sessionId.');
  }
  // reconciliationId is optional on input, not required, so that this
  // function stays backward-compatible with a client build that predates
  // it: web and functions deploy independently in this project (see
  // task-5-report.md — reconcileSessionOnLogin has been deployed standalone
  // via `firebase deploy --only functions:reconcileSessionOnLogin` before),
  // so an old client can call a new function, or vice versa, for however
  // long a deploy window lasts. Falling back to sessionId (which is what
  // the current client sends as reconciliationId anyway) keeps that window
  // safe instead of turning every sign-in into a hard failure.
  const effectiveReconciliationId =
    typeof reconciliationId === 'string' && reconciliationId ? reconciliationId : sessionId;

  const db = getFirestore();
  await db.runTransaction(async (transaction) => {
    const tx = buildAdminTransaction(db, transaction);
    await runReconciliation(tx, {
      sessionId,
      userId,
      phone,
      incomingCartItems: cartItems ?? [],
      reconciliationId: effectiveReconciliationId,
    });
  });
});

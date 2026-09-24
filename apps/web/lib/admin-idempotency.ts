import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * [ABE-03] Idempotency-Key support for admin write endpoints that move
 * money or advance a transition — mirrors the doc-per-key pattern already
 * proven by webhookEvents (functions/src/webhooks/idempotency.ts): a
 * durable Firestore doc keyed by `{routeKey}_{Idempotency-Key header}`,
 * written only after the underlying action succeeds. A retried request
 * with the same key returns the SAME recorded response instead of
 * repeating the side effect (queuing a duplicate print job, calling
 * Razorpay refund twice). Unlike webhookEvents (which only needs a
 * boolean "already processed"), callers here need the ORIGINAL response
 * body back on a retry, so the record stores {status, body}.
 *
 * Deliberately NOT a general request-locking mechanism — it doesn't
 * prevent two concurrent requests with the same key from both executing
 * before either has recorded a result (that needs a transaction around
 * the whole handler, which return-advance's own code already documents
 * as an accepted gap for a low-concurrency, staff-only action). This only
 * makes a SEQUENTIAL retry (the common case: a timeout, a double-click,
 * a network blip) return the original result instead of re-executing.
 */
export interface IdempotencyRecord {
  status: number;
  body: unknown;
}

const COLLECTION = 'idempotencyKeys';

function idempotencyRef(db: Firestore, routeKey: string, idempotencyKey: string) {
  return db.collection(COLLECTION).doc(`${routeKey}_${idempotencyKey}`);
}

export function getIdempotencyKeyHeader(request: Request): string | null {
  const value = request.headers.get('Idempotency-Key');
  return value && value.trim().length > 0 ? value.trim() : null;
}

export async function findIdempotentResponse(
  db: Firestore,
  routeKey: string,
  idempotencyKey: string
): Promise<IdempotencyRecord | null> {
  const snap = await idempotencyRef(db, routeKey, idempotencyKey).get();
  return snap.exists ? (snap.data() as IdempotencyRecord) : null;
}

export async function recordIdempotentResponse(
  db: Firestore,
  routeKey: string,
  idempotencyKey: string,
  status: number,
  body: unknown
): Promise<void> {
  await idempotencyRef(db, routeKey, idempotencyKey).set({ status, body, createdAt: new Date().toISOString() });
}

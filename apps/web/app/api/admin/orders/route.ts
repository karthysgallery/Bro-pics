import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import type { Query } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { OrderListQuerySchema, encodeOrderCursor, decodeOrderCursor } from './order-list-query';
import { OrderStatusSchema } from '@bro-pics/shared';

/**
 * [ABE-15] Resolves `q` (phone or email) to a `userId` first, then
 * filters orders by that — a two-step lookup, not a direct order-field
 * search, since neither phone nor email lives on the order doc itself
 * (phone is inside the free-form `addressJson`, email isn't captured on
 * the order at all; both live on the `users/{id}` doc). An email-looking
 * `q` (contains '@') searches `users.email`; anything else searches
 * `users.phone`. Both are plain equality queries, auto-indexed.
 */
async function resolveUserIdFromSearch(db: FirebaseFirestore.Firestore, q: string): Promise<string | null> {
  const field = q.includes('@') ? 'email' : 'phone';
  const snapshot = await db.collection('users').where(field, '==', q).limit(1).get();
  return snapshot.empty ? null : snapshot.docs[0].id;
}

export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'orders:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Staff access required');
  }

  const url = new URL(request.url);
  const parsed = OrderListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid query parameters', { issues: parsed.error.issues });
  }
  const query = parsed.data;

  // paymentStatus is deliberately not a supported filter — see
  // order-list-query.ts's own doc comment: no (paymentStatus+placedAt)
  // composite index exists, and this environment can't deploy one.
  if (url.searchParams.has('paymentStatus')) {
    return adminApiError(400, 'invalid_request', 'paymentStatus is not a supported filter (no supporting index)');
  }

  let statusFilter: string | undefined;
  if (query.status) {
    const statusParsed = OrderStatusSchema.safeParse(query.status);
    if (!statusParsed.success) {
      return adminApiError(400, 'invalid_request', `Invalid status: ${query.status}`);
    }
    statusFilter = statusParsed.data;
  }

  const db = getFirestore(getAdminApp());

  let userIdFilter: string | null = null;
  if (query.q) {
    userIdFilter = await resolveUserIdFromSearch(db, query.q);
    if (!userIdFilter) {
      return NextResponse.json({ orders: [], nextCursor: null }, { status: 200 });
    }
  }

  let ordersQuery: Query = db.collection('orders');
  if (statusFilter) {
    ordersQuery = ordersQuery.where('status', '==', statusFilter);
  }
  if (userIdFilter) {
    ordersQuery = ordersQuery.where('userId', '==', userIdFilter);
  }
  if (query.from) {
    ordersQuery = ordersQuery.where('placedAt', '>=', new Date(query.from));
  }
  if (query.to) {
    ordersQuery = ordersQuery.where('placedAt', '<=', new Date(query.to));
  }
  ordersQuery = ordersQuery.orderBy('placedAt', 'desc');

  if (query.cursor) {
    const cursor = decodeOrderCursor(query.cursor);
    if (!cursor) {
      return adminApiError(400, 'invalid_request', 'Invalid cursor');
    }
    ordersQuery = ordersQuery.startAfter(cursor.placedAt);
  }

  // Fetch one extra row to know whether a next page exists, without a
  // separate count query.
  const snapshot = await ordersQuery.limit(query.limit + 1).get();
  const docs = snapshot.docs.slice(0, query.limit);
  const hasMore = snapshot.docs.length > query.limit;

  const orders = docs.map((doc) => {
    const data = doc.data() as { orderNo: string; status: string; total: number; placedAt: FirebaseFirestore.Timestamp; addressJson: Record<string, unknown> };
    return {
      id: doc.id,
      orderNo: data.orderNo,
      status: data.status,
      total: data.total,
      placedAt: data.placedAt,
      addressJson: data.addressJson,
    };
  });

  const last = docs[docs.length - 1];
  const nextCursor =
    hasMore && last ? encodeOrderCursor((last.data() as { placedAt: FirebaseFirestore.Timestamp }).placedAt.toDate(), last.id) : null;

  return NextResponse.json({ orders, nextCursor }, { status: 200 });
}

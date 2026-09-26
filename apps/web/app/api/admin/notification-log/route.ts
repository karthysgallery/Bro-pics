import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { NotificationOutboxStatusSchema } from '@bro-pics/shared';

const LIST_LIMIT = 200;

/**
 * [ABE-25] Admin view of `notificationOutbox` — a pure queue with
 * nothing consuming it yet (no send pipeline exists, see BE-28/29).
 * `status`/`userId` are each a plain equality filter, never combined
 * with an orderBy in the query itself — sorted in memory by `createdAt`
 * after fetching, so no new composite index is needed.
 */
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
  const statusParam = url.searchParams.get('status');
  const userId = url.searchParams.get('userId');

  if (statusParam) {
    const statusParsed = NotificationOutboxStatusSchema.safeParse(statusParam);
    if (!statusParsed.success) {
      return adminApiError(400, 'invalid_request', `Invalid status: ${statusParam}`);
    }
  }

  const db = getFirestore(getAdminApp());
  let query: FirebaseFirestore.Query = db.collection('notificationOutbox');
  if (statusParam) {
    query = query.where('status', '==', statusParam);
  }
  if (userId) {
    query = query.where('userId', '==', userId);
  }

  const snapshot = await query.limit(LIST_LIMIT).get();
  const entries = snapshot.docs
    .map((doc) => doc.data() as { createdAt: FirebaseFirestore.Timestamp })
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

  return NextResponse.json({ entries }, { status: 200 });
}

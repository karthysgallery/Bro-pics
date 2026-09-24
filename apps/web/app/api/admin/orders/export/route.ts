import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import type { Query } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { OrderStatusSchema } from '@bro-pics/shared';

const EXPORT_ROW_LIMIT = 5000;

const CSV_COLUMNS = ['orderNo', 'status', 'paymentStatus', 'total', 'placedAt', 'userId'] as const;

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * [ABE-15] Same filters as `GET /api/admin/orders`, same status/q
 * mutual-exclusion and paymentStatus rejection reasoning (see
 * `order-list-query.ts`'s doc comment) — this route doesn't reuse that
 * module's zod schema since it only needs `status`/`from`/`to` (no `q`
 * search, no cursor: an export is a bounded, one-shot pull, not a paged
 * UI list). Capped at 5,000 rows — a `.csv` sent straight back in the
 * response body, not a background job or a Storage upload; a larger
 * export needs a real job queue this environment doesn't have reason to
 * build yet given the catalogue's current scale.
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
  if (url.searchParams.has('paymentStatus')) {
    return adminApiError(400, 'invalid_request', 'paymentStatus is not a supported filter (no supporting index)');
  }

  const statusParam = url.searchParams.get('status');
  let statusFilter: string | undefined;
  if (statusParam) {
    const statusParsed = OrderStatusSchema.safeParse(statusParam);
    if (!statusParsed.success) {
      return adminApiError(400, 'invalid_request', `Invalid status: ${statusParam}`);
    }
    statusFilter = statusParsed.data;
  }
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const db = getFirestore(getAdminApp());
  let ordersQuery: Query = db.collection('orders');
  if (statusFilter) {
    ordersQuery = ordersQuery.where('status', '==', statusFilter);
  }
  if (from) {
    ordersQuery = ordersQuery.where('placedAt', '>=', new Date(from));
  }
  if (to) {
    ordersQuery = ordersQuery.where('placedAt', '<=', new Date(to));
  }
  ordersQuery = ordersQuery.orderBy('placedAt', 'desc').limit(EXPORT_ROW_LIMIT);

  const snapshot = await ordersQuery.get();

  const lines = [CSV_COLUMNS.join(',')];
  for (const doc of snapshot.docs) {
    const data = doc.data() as Record<string, unknown> & { placedAt?: FirebaseFirestore.Timestamp };
    const placedAtIso = data.placedAt?.toDate ? data.placedAt.toDate().toISOString() : '';
    lines.push(
      CSV_COLUMNS.map((col) => csvEscape(col === 'placedAt' ? placedAtIso : data[col])).join(',')
    );
  }
  const csv = lines.join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="orders-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../../../lib/admin-api-error';
import { describeItemOriginals, listItemOriginals, printFilePath } from '../../../../../../../../lib/order-item-files';
import type { OrderItem } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

/**
 * What can be downloaded for one order item, so the admin order page can show a "Files" box:
 * the preview the customer saw, each original photo, and the print-ready file (with the state of its print job).
 * Only describes the files; the actual links are minted per click by ./download, which also records who downloaded.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const permission = await requirePermission(request, 'orders:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Staff access required');
  }

  const { id: orderId, itemId } = await params;
  const db = getFirestore(getAdminApp());
  const itemSnap = await db.collection('orders').doc(orderId).collection('items').doc(itemId).get();
  if (!itemSnap.exists) return adminApiError(404, 'not_found', `Unknown item id: ${itemId} on order ${orderId}`);
  const item = itemSnap.data() as OrderItem;

  const [originals, [printExists], jobSnap] = await Promise.all([
    listItemOriginals(db, item).then((list) => describeItemOriginals(db, list)),
    getStorage(getAdminApp()).bucket().file(printFilePath(orderId, itemId)).exists(),
    db.collection('printJobs').doc(`${orderId}_${itemId}`).get(),
  ]);
  const job = jobSnap.exists ? (jobSnap.data() as { status?: string; lastError?: string; attempts?: number }) : null;

  return NextResponse.json(
    {
      itemId,
      preview: Boolean(item.previewPath),
      print: {
        available: printExists,
        // queued | rendering | done | failed | failed_permanent …; null when no job exists (e.g. the print service never ran)
        jobStatus: job?.status ?? null,
        jobError: job?.lastError ?? null,
      },
      originals: originals.map((o) => ({ uploadId: o.uploadId, label: o.label, widthPx: o.widthPx, heightPx: o.heightPx, available: o.originalPath !== null })),
    },
    { status: 200 }
  );
}

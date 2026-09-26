import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../../../lib/audit-log';
import { getSignedReadUrl } from '../../../../../../../../lib/storage-url';
import { DownloadTypeSchema } from './download-request-schema';
import { logger, type OrderItem, type Upload } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

// [BE-16] The exact path uploadPrintFile() in render-job.ts writes a
// completed print file to — deterministic, so this route can check for
// it without needing PrintJob.renderedFilePath (which is per-job, and
// this route only has an item id, not a job id).
function printFilePath(orderId: string, itemId: string): string {
  return `print-files/${orderId}/${itemId}/print.png`;
}

/**
 * [ABE-16] Signed downloads for an order item's original photo, its
 * preview, or its rendered print file — staff-only (`orders:read`
 * already gates every staff/admin caller to that) and logged (every
 * call writes an audit entry, since these are a customer's private
 * photos). Reuses `getSignedReadUrl` (BE-03/BE-04's helper, 15-minute
 * TTL) — never a stored/cached URL, same "only the path is durable"
 * convention as everywhere else these are read.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const { id: orderId, itemId } = await params;
  const url = new URL(request.url);
  const typeParsed = DownloadTypeSchema.safeParse(url.searchParams.get('type'));
  if (!typeParsed.success) {
    return adminApiError(400, 'invalid_request', 'type must be one of original, preview, print');
  }
  const type = typeParsed.data;

  const db = getFirestore(getAdminApp());
  const itemSnap = await db.collection('orders').doc(orderId).collection('items').doc(itemId).get();
  if (!itemSnap.exists) {
    return adminApiError(404, 'not_found', `Unknown item id: ${itemId} on order ${orderId}`);
  }
  const item = itemSnap.data() as OrderItem;

  let path: string | null = null;
  if (type === 'preview') {
    path = item.previewPath;
  } else if (type === 'print') {
    path = printFilePath(orderId, itemId);
    const [exists] = await getStorage(getAdminApp()).bucket().file(path).exists();
    if (!exists) path = null;
  } else {
    // 'original' — resolve via this item's Customizations. A plain
    // equality query, sorted in memory after fetching — the same pattern
    // services/print-render's own getCustomizationsForPersonalization
    // uses for the identical query, since an equality filter plus
    // orderBy on a DIFFERENT field would need a composite index that
    // doesn't exist for this collection. Slot 0 (or whichever sorts
    // first) is the one staff most often need for a fulfillment
    // question, not a specific slot on a multi-slot item.
    const customizationsSnap = await db
      .collection('customizations')
      .where('personalizationId', '==', item.personalizationId)
      .get();
    const customizations = customizationsSnap.docs
      .map((doc) => doc.data() as { uploadId: string; slotIndex: number })
      .sort((a, b) => a.slotIndex - b.slotIndex);
    if (customizations.length > 0) {
      const uploadSnap = await db.collection('uploads').doc(customizations[0].uploadId).get();
      if (uploadSnap.exists) {
        path = (uploadSnap.data() as Upload).originalPath;
      }
    }
  }

  if (!path) {
    return adminApiError(404, 'not_found', `No ${type} file available for this item yet`);
  }

  const signedUrl = await getSignedReadUrl(path);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'order.item_download',
    resource: 'order_item',
    resourceId: itemId,
    details: { orderId, type },
  }).catch((error) => logger.error('Failed to write audit log', { orderId, itemId, error: String(error) }));

  return NextResponse.json({ url: signedUrl, type }, { status: 200 });
}

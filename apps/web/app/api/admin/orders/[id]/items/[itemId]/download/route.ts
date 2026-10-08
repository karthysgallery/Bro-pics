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
import { fileExtension, listItemOriginals, printFilePath, safeFileName } from '../../../../../../../../lib/order-item-files';
import { logger, type OrderItem, type Upload } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

// [BE-16] The exact path uploadPrintFile() in render-job.ts writes a completed print file to is
// deterministic (printFilePath), so this route can check for it without needing a job id.

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

  const orderSnap = await db.collection('orders').doc(orderId).get();
  const orderNo = (orderSnap.exists ? (orderSnap.data() as { orderNo?: string }).orderNo : undefined) ?? orderId;
  const frameLabel = item.combo?.frameLabel ? `-${item.combo.frameLabel}` : '';
  const baseName = safeFileName(`${orderNo}${frameLabel}-${item.title}`);

  let path: string | null = null;
  let downloadAs: string | undefined;
  if (type === 'preview') {
    path = item.previewPath ?? null;
    if (path) downloadAs = `${baseName}-preview.${fileExtension(path, 'png')}`;
  } else if (type === 'print') {
    path = printFilePath(orderId, itemId);
    const [exists] = await getStorage(getAdminApp()).bucket().file(path).exists();
    if (!exists) path = null;
    else downloadAs = `${baseName}-PRINT-READY.png`;
  } else {
    // 'original': one of THIS item's photos. `upload` picks which; without it the first photo is used. An
    // upload id that does not belong to this item is refused, so this route can't be used to read other
    // customers' photos by guessing ids.
    const originals = await listItemOriginals(db, item);
    const wanted = url.searchParams.get('upload');
    const chosen = wanted ? originals.find((o) => o.uploadId === wanted) : originals[0];
    if (wanted && !chosen) {
      return adminApiError(404, 'not_found', 'That photo does not belong to this item');
    }
    if (chosen) {
      const uploadSnap = await db.collection('uploads').doc(chosen.uploadId).get();
      if (uploadSnap.exists) {
        path = (uploadSnap.data() as Upload).originalPath;
        downloadAs = `${baseName}-${safeFileName(chosen.label.toLowerCase())}-original.${fileExtension(path, 'jpg')}`;
      }
    }
  }

  if (!path) {
    return adminApiError(404, 'not_found', `No ${type} file available for this item yet`);
  }

  const signedUrl = await getSignedReadUrl(path, undefined, downloadAs);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'order.item_download',
    resource: 'order_item',
    resourceId: itemId,
    details: { orderId, type },
  }).catch((error) => logger.error('Failed to write audit log', { orderId, itemId, error: String(error) }));

  return NextResponse.json({ url: signedUrl, type }, { status: 200 });
}

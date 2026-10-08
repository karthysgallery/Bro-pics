import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import JSZip from 'jszip';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { describeItemOriginals, fileExtension, listItemOriginals, printFilePath, safeFileName } from '../../../../../../lib/order-item-files';
import { logger, type Order, type OrderItem } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Everything is held in memory to build the zip, so an order with enormous photos is refused rather than risk the server. */
const MAX_ZIP_BYTES = 250 * 1024 * 1024;

/**
 * One zip with everything staff need to produce an order, a folder per item:
 *   {orderNo}/{n}-{Frame N}-{product}/preview.png, photo-1-original.jpg, …, PRINT-READY.png
 * so the preview (what the customer saw), the original photos (to redesign by hand) and the print-ready file
 * (to print as is) all arrive together. An item whose print file isn't rendered yet simply has no PRINT-READY file.
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

  const { id: orderId } = await params;
  const db = getFirestore(getAdminApp());
  const orderSnap = await db.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) return adminApiError(404, 'not_found', `Unknown order id: ${orderId}`);
  const order = orderSnap.data() as Order;

  const bucket = getStorage(getAdminApp()).bucket();
  const itemsSnap = await db.collection('orders').doc(orderId).collection('items').get();
  const items = itemsSnap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as OrderItem }))
    .sort((a, b) => (a.data.combo?.frameLabel ?? '').localeCompare(b.data.combo?.frameLabel ?? '', undefined, { numeric: true }));

  const zip = new JSZip();
  const manifest: string[] = [`Order ${order.orderNo}`, ''];
  let totalBytes = 0;

  for (const [index, { id, data: item }] of items.entries()) {
    const folderName = safeFileName(`${index + 1}-${item.combo?.frameLabel ?? 'item'}-${item.title}`);
    const folder = zip.folder(`${safeFileName(order.orderNo)}/${folderName}`)!;
    manifest.push(`${folderName}: ${item.title} x${item.qty}${item.combo ? ` (${item.combo.comboName}, ${item.combo.frameLabel})` : ''}`);

    const add = async (path: string | null | undefined, name: string, label: string) => {
      if (!path) {
        manifest.push(`  - ${label}: not available`);
        return;
      }
      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (!exists) {
        manifest.push(`  - ${label}: not available`);
        return;
      }
      const [buffer] = await file.download();
      totalBytes += buffer.length;
      if (totalBytes > MAX_ZIP_BYTES) throw new Error('too_large');
      folder.file(name, buffer);
      manifest.push(`  - ${label}: ${name}`);
    };

    try {
      await add(item.previewPath, `preview.${fileExtension(item.previewPath ?? '', 'png')}`, 'preview (what the customer saw)');
      const originals = await describeItemOriginals(db, await listItemOriginals(db, item));
      for (const original of originals) {
        const name = `${safeFileName(original.label.toLowerCase())}-original.${fileExtension(original.originalPath ?? '', 'jpg')}`;
        await add(original.originalPath, name, `${original.label} (original upload${original.widthPx ? `, ${original.widthPx}x${original.heightPx} px` : ''})`);
      }
      await add(printFilePath(orderId, id), 'PRINT-READY.png', 'print-ready file (300 DPI)');
    } catch (error) {
      if (error instanceof Error && error.message === 'too_large') {
        return adminApiError(413, 'invalid_request', 'The files for this order are too large to bundle in one zip. Download the items one at a time.');
      }
      throw error;
    }
  }

  zip.file(`${safeFileName(order.orderNo)}/README.txt`, manifest.join('\n'));
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'order.files_zip',
    resource: 'order',
    resourceId: orderId,
    details: { items: items.length, bytes: totalBytes },
  }).catch((error) => logger.error('Failed to write audit log', { orderId, error: String(error) }));

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeFileName(order.orderNo)}-files.zip"`,
    },
  });
}

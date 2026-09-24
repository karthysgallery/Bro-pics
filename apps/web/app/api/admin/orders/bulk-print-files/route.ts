import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import JSZip from 'jszip';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { BulkPrintFilesQuerySchema } from './bulk-print-files-query';
import { logger, type Order, type OrderItem } from '@bro-pics/shared';

interface JobSheetRow {
  orderNo: string;
  itemId: string;
  title: string;
  qty: number;
  included: 'yes' | 'no';
}

function csvEscape(value: unknown): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function buildJobSheetCsv(rows: JobSheetRow[]): string {
  const header = 'orderNo,itemId,title,qty,included';
  const lines = rows.map((r) => [r.orderNo, r.itemId, r.title, r.qty, r.included].map(csvEscape).join(','));
  return [header, ...lines].join('\n');
}

/**
 * [ABE-16] The last of the 9 sub-items. For a bounded batch of orders
 * (max 20 — a print run, not the whole queue), bundles every already-
 * rendered print file into one `.zip`, organized `{orderNo}/{itemId}.png`,
 * alongside a `job-sheet.csv` manifest (every requested item, whether its
 * print file was actually found) — the "job sheet" a print shop staff
 * hands off with the batch. An item whose print file doesn't exist yet
 * (never rendered, or still queued) is skipped from the zip but still
 * listed in the job sheet as `included: no`, so staff can see what's
 * missing rather than silently getting an incomplete batch with no
 * explanation.
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
  const parsed = BulkPrintFilesQuerySchema.safeParse({ orderIds: url.searchParams.get('orderIds') ?? '' });
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid orderIds query parameter', { issues: parsed.error.issues });
  }
  const { orderIds } = parsed.data;

  const db = getFirestore(getAdminApp());
  const bucket = getStorage(getAdminApp()).bucket();
  const zip = new JSZip();
  const jobSheetRows: JobSheetRow[] = [];

  for (const orderId of orderIds) {
    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) continue;
    const order = orderSnap.data() as Order;

    const itemsSnap = await db.collection('orders').doc(orderId).collection('items').get();
    for (const itemDoc of itemsSnap.docs) {
      const item = itemDoc.data() as OrderItem;
      const path = `print-files/${orderId}/${itemDoc.id}/print.png`;
      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (exists) {
        const [buffer] = await file.download();
        zip.file(`${order.orderNo}/${itemDoc.id}.png`, buffer);
      }
      jobSheetRows.push({
        orderNo: order.orderNo,
        itemId: itemDoc.id,
        title: item.title,
        qty: item.qty,
        included: exists ? 'yes' : 'no',
      });
    }
  }

  zip.file('job-sheet.csv', buildJobSheetCsv(jobSheetRows));
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'order.bulk_print_files',
    resource: 'order',
    resourceId: orderIds.join(','),
    details: { requested: orderIds.length, itemsIncluded: jobSheetRows.filter((r) => r.included === 'yes').length },
  }).catch((error) => logger.error('Failed to write audit log', { error: String(error) }));

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="print-files-${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  });
}

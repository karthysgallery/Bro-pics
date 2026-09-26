import { NextResponse } from 'next/server';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../../../lib/audit-log';
import { logger, type OrderItem } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

/**
 * [ABE-16] Re-queues one item's print job for a fresh render — resets
 * the EXISTING job doc back to 'queued' rather than creating a genuinely
 * new one. `PrintJobSchema.id` is deterministic (`{orderId}_{itemId}`,
 * see `printJobId`/`buildQueuedPrintJob` in packages/shared/src/
 * print-jobs/print-jobs.ts), and `createPrintJob` is explicitly a no-op
 * when a job for that pair already exists — there is NO job-group/
 * version concept in the current schema at all, one job doc per item,
 * forever. The task text asks for "a new job group" — building real
 * multi-attempt job history would mean changing `PrintJobSchema`'s id
 * scheme, which touches the live print pipeline (BE-17/BE-18,
 * services/print-render) and deserves its own careful pass, not a bolt-on
 * here; logged as genuinely not done, not silently narrowed.
 *
 * Similarly, "a `print_rerendered` event" is NOT written as an
 * `orders/{id}/events` entry — `OrderEventSchema.status` is typed as
 * `OrderStatus`, and re-rendering one item never changes the ORDER's own
 * status (the order stays wherever it already was). Adding a fake status
 * value purely to log an event would be worse than using the mechanism
 * this codebase already has for exactly this kind of non-status-changing
 * admin action: `writeAuditLog`.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'orders:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Staff access required');
  }

  const { id: orderId, itemId } = await params;
  const db = getFirestore(getAdminApp());

  const itemSnap = await db.collection('orders').doc(orderId).collection('items').doc(itemId).get();
  if (!itemSnap.exists) {
    return adminApiError(404, 'not_found', `Unknown item id: ${itemId} on order ${orderId}`);
  }
  const item = itemSnap.data() as OrderItem;

  const jobRef = db.collection('printJobs').doc(`${orderId}_${itemId}`);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) {
    return adminApiError(404, 'not_found', 'No print job exists for this item yet — it was never queued for rendering');
  }

  const customizationsSnap = await db.collection('customizations').where('personalizationId', '==', item.personalizationId).get();

  const now = new Date();
  const batch = db.batch();
  batch.update(jobRef, {
    status: 'queued',
    attempts: 0,
    nextAttemptAt: now,
    updatedAt: now,
    renderedFilePath: FieldValue.delete(),
    lastError: FieldValue.delete(),
    leasedAt: FieldValue.delete(),
    leaseExpiresAt: FieldValue.delete(),
  });
  for (const doc of customizationsSnap.docs) {
    batch.update(doc.ref, { renderStatus: 'pending', renderedFilePath: FieldValue.delete() });
  }
  await batch.commit();

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'order.item_rerender',
    resource: 'order_item',
    resourceId: itemId,
    details: { orderId },
  }).catch((error) => logger.error('Failed to write audit log', { orderId, itemId, error: String(error) }));

  return NextResponse.json({ orderId, itemId, status: 'queued' }, { status: 200 });
}

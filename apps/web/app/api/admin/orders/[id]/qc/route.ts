import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { QcBodySchema } from './qc-request-schema';
import { transitionOrder, OrderNotFoundError, InvalidTransitionError, logger } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * [ABE-16] PASS -> 'packed' (the canonical post-QC status —
 * status-transitions.ts's own comment explains why this is preferred
 * over the legacy 'printed_packed'); FAIL -> 'rework' (which itself
 * transitions back to 'in_production' — see the same file). A thin
 * transitionOrder() caller: no new query shapes, the reason on a FAIL
 * becomes the transition event's note so it's visible in the order's
 * event history, not a separate field to look up.
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

  const { id } = await params;
  const rawBody = await request.json().catch(() => null);
  const parsed = QcBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid QC body', { issues: parsed.error.issues });
  }
  const { result, reason } = parsed.data;
  const toStatus = result === 'pass' ? 'packed' : 'rework';

  const db = getFirestore(getAdminApp());
  try {
    await transitionOrder(db, {
      orderId: id,
      toStatus,
      actorUid: permission.uid,
      note: reason ?? null,
    });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return adminApiError(404, 'not_found', `Unknown order id: ${id}`);
    }
    if (error instanceof InvalidTransitionError) {
      return adminApiError(409, 'conflict', `Cannot transition from ${error.from} to ${error.to}`, { allowed: error.allowed });
    }
    throw error;
  }

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'order.qc',
    resource: 'order',
    resourceId: id,
    details: { result, ...(reason && { reason }) },
  }).catch((error) => logger.error('Failed to write audit log', { orderId: id, error: String(error) }));

  return NextResponse.json({ id, result, status: toStatus }, { status: 200 });
}

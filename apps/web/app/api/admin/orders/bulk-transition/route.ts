import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { BulkTransitionBodySchema } from './bulk-transition-request-schema';
import {
  transitionOrder,
  OrderNotFoundError,
  InvalidTransitionError,
  OrderStatusSchema,
  logger,
} from '@bro-pics/shared';

interface BulkTransitionResult {
  orderId: string;
  ok: boolean;
  error?: string;
  allowed?: string[];
}

/**
 * [ABE-16] Each order in a batch can legally fail independently (wrong
 * current status, concurrent change elsewhere) — this returns per-order
 * results with a 200, not all-or-nothing. Firestore transactions can't
 * span 100 orders × their own reads/writes anyway; sequential
 * single-order `transitionOrder()` calls, one order's failure never
 * rolling back another's success, is the only shape that makes sense
 * here.
 */
export async function POST(request: Request): Promise<NextResponse> {
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

  const rawBody = await request.json().catch(() => null);
  const parsed = BulkTransitionBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid bulk-transition body', { issues: parsed.error.issues });
  }
  const { orderIds, toStatus: toStatusRaw, note } = parsed.data;

  const statusParsed = OrderStatusSchema.safeParse(toStatusRaw);
  if (!statusParsed.success) {
    return adminApiError(400, 'invalid_request', `Invalid toStatus: ${toStatusRaw}`);
  }
  const toStatus = statusParsed.data;

  const db = getFirestore(getAdminApp());
  const results: BulkTransitionResult[] = [];

  for (const orderId of orderIds) {
    try {
      await transitionOrder(db, { orderId, toStatus, actorUid: permission.uid, note });
      results.push({ orderId, ok: true });
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        results.push({ orderId, ok: false, error: 'not_found' });
      } else if (error instanceof InvalidTransitionError) {
        results.push({ orderId, ok: false, error: 'invalid_transition', allowed: error.allowed });
      } else {
        logger.error('Bulk transition failed for order', { orderId, error: String(error) });
        results.push({ orderId, ok: false, error: 'internal_error' });
      }
    }
  }

  const succeeded = results.filter((r) => r.ok).map((r) => r.orderId);
  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'order.bulk_transition',
    resource: 'order',
    resourceId: orderIds.join(','),
    details: { toStatus, requested: orderIds.length, succeeded: succeeded.length },
  }).catch((error) => logger.error('Failed to write audit log', { error: String(error) }));

  return NextResponse.json({ results }, { status: 200 });
}

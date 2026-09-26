import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import {
  computeDailyRollup,
  IST_OFFSET_MS,
  type OrderWithItemsForRollup,
  type AnalyticsDaily,
} from '@bro-pics/shared';
import { RollupRequestBodySchema } from './rollup-request-schema';

function parseIstDayRange(dateStr: string): { start: Date; end: Date } {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const monthIdx = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  const startUtcMs = Date.UTC(year, monthIdx, day, 0, 0, 0, 0) - IST_OFFSET_MS;
  const endUtcMs = Date.UTC(year, monthIdx, day, 23, 59, 59, 999) - IST_OFFSET_MS;

  return {
    start: new Date(startUtcMs),
    end: new Date(endUtcMs),
  };
}

/**
 * [ABE-29 / ANL-05] Admin On-Demand Daily Analytics Roll-up & Backfill
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'analytics:read');
  if (!permission.ok) {
    return adminApiError(
      permission.status,
      permission.status === 401 ? 'unauthenticated' : 'forbidden',
      'Staff access required'
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = RollupRequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid rollup request parameters', {
      issues: parsed.error.issues,
    });
  }

  const db = getFirestore(getAdminApp());

  let targetDates: string[] = [];
  if (parsed.data.fromDate && parsed.data.toDate) {
    const cur = new Date(`${parsed.data.fromDate}T00:00:00Z`);
    const end = new Date(`${parsed.data.toDate}T00:00:00Z`);
    while (cur <= end) {
      const y = cur.getUTCFullYear();
      const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
      const d = String(cur.getUTCDate()).padStart(2, '0');
      targetDates.push(`${y}-${m}-${d}`);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  } else if (parsed.data.date) {
    targetDates = [parsed.data.date];
  } else {
    // Default to yesterday IST
    const yesterdayIst = new Date(Date.now() - 24 * 60 * 60 * 1000 + IST_OFFSET_MS);
    const y = yesterdayIst.getUTCFullYear();
    const m = String(yesterdayIst.getUTCMonth() + 1).padStart(2, '0');
    const d = String(yesterdayIst.getUTCDate()).padStart(2, '0');
    targetDates = [`${y}-${m}-${d}`];
  }

  const processedDays: string[] = [];

  for (const dateStr of targetDates) {
    const { start, end } = parseIstDayRange(dateStr);

    const ordersSnap = await db
      .collection('orders')
      .where('placedAt', '>=', start)
      .where('placedAt', '<=', end)
      .get();

    const ordersWithItems: OrderWithItemsForRollup[] = [];

    for (const doc of ordersSnap.docs) {
      const oData = doc.data();
      let items: OrderWithItemsForRollup['items'] = [];
      try {
        const itemsSnap = await doc.ref.collection('items').get();
        items = itemsSnap.docs.map((iDoc) => {
          const iData = iDoc.data();
          return {
            productId: iData.productId ?? '',
            title: iData.title ?? '',
            quantity: iData.quantity ?? 1,
            price: iData.unitPriceSnapshot ?? iData.price ?? 0,
          };
        });
      } catch {
        items = [];
      }

      ordersWithItems.push({
        id: doc.id,
        status: oData.status,
        paymentStatus: oData.paymentStatus,
        paymentMode: oData.paymentMode ?? 'prepaid',
        total: oData.total ?? 0,
        discount: oData.discount ?? 0,
        shipping: oData.shipping ?? 0,
        taxLines: oData.taxLines ?? [],
        userId: oData.userId ?? '',
        items,
      });
    }

    // Processed refunds
    let refunds: Array<{ id: string; status: 'processed'; amount: number }> = [];
    try {
      const refundsSnap = await db
        .collectionGroup('refunds')
        .where('status', '==', 'processed')
        .get();

      for (const rDoc of refundsSnap.docs) {
        const rData = rDoc.data();
        const processedAt =
          rData.processedAt instanceof Date
            ? rData.processedAt
            : typeof rData.processedAt?.toDate === 'function'
              ? rData.processedAt.toDate()
              : rData.processedAt
                ? new Date(rData.processedAt)
                : null;

        if (processedAt && processedAt >= start && processedAt <= end) {
          refunds.push({
            id: rDoc.id,
            status: 'processed',
            amount: rData.amount ?? 0,
          });
        }
      }
    } catch {
      refunds = [];
    }

    // Past customers before start
    const pastSnap = await db
      .collection('orders')
      .where('paymentStatus', '==', 'paid')
      .where('placedAt', '<', start)
      .get();
    const pastCustomerIds = new Set<string>();
    for (const pDoc of pastSnap.docs) {
      const pData = pDoc.data();
      if (pData.userId) {
        pastCustomerIds.add(pData.userId);
      }
    }

    const rollup: AnalyticsDaily = computeDailyRollup(
      dateStr,
      ordersWithItems,
      refunds,
      pastCustomerIds
    );

    await db.collection('analyticsDaily').doc(dateStr).set(rollup);
    processedDays.push(dateStr);
  }

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'analytics.daily_rollup',
    resource: 'analyticsDaily',
    resourceId: targetDates[0],
    details: { count: processedDays.length, processedDays },
  });

  return NextResponse.json({ success: true, processedDays }, { status: 200 });
}

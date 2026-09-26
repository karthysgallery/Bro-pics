import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import {
  computeSalesAnalytics,
  computeProductsAnalytics,
  computeCustomersAnalytics,
  computeMarketingAnalytics,
  computePersonalizationAnalytics,
  computeFunnelAnalytics,
  computeOperationsAnalytics,
  IST_OFFSET_MS,
  type OrderWithItemsForRollup,
  type Return,
  type PrintJob,
  type Customization,
  type Refund,
} from '@bro-pics/shared';

const VALID_DOMAINS = [
  'sales',
  'products',
  'customers',
  'marketing',
  'personalization',
  'funnel',
  'operations',
] as const;

type AnalyticsDomain = (typeof VALID_DOMAINS)[number];

interface RouteParams {
  params: Promise<{ domain: string }>;
}

function parseDateRange(fromParam: string | null, toParam: string | null): { start: Date; end: Date; fromStr: string; toStr: string } {
  const now = new Date();
  const defaultTo = new Date(now.getTime() + IST_OFFSET_MS);
  const defaultFrom = new Date(defaultTo.getTime() - 30 * 24 * 60 * 60 * 1000);

  const formatYmd = (d: Date) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const toStr = toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : formatYmd(defaultTo);
  const fromStr = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : formatYmd(defaultFrom);

  const [fromY, fromM, fromD] = fromStr.split('-').map(Number);
  const [toY, toM, toD] = toStr.split('-').map(Number);

  const start = new Date(Date.UTC(fromY, fromM - 1, fromD, 0, 0, 0, 0) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(toY, toM - 1, toD, 23, 59, 59, 999) - IST_OFFSET_MS);

  return { start, end, fromStr, toStr };
}

/**
 * [ABE-30 / ANL-06/07] Dedicated analytics endpoints for:
 * sales, products, customers, marketing, personalization, funnel, operations.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const { domain } = await params;
  if (!VALID_DOMAINS.includes(domain as AnalyticsDomain)) {
    return adminApiError(
      400,
      'invalid_request',
      `Invalid analytics domain: ${domain}. Must be one of: ${VALID_DOMAINS.join(', ')}`
    );
  }

  const url = new URL(request.url);
  const { start, end, fromStr, toStr } = parseDateRange(
    url.searchParams.get('from'),
    url.searchParams.get('to')
  );

  const db = getFirestore(getAdminApp());

  // Base query: orders in range
  const ordersSnap = await db
    .collection('orders')
    .where('placedAt', '>=', start)
    .where('placedAt', '<=', end)
    .get();

  const ordersData = ordersSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ref: d.ref,
      ...data,
      placedAt:
        data.placedAt instanceof Date
          ? data.placedAt
          : typeof data.placedAt?.toDate === 'function'
            ? data.placedAt.toDate()
            : new Date(data.placedAt),
    };
  });

  let domainData: unknown = null;

  switch (domain as AnalyticsDomain) {
    case 'sales': {
      let refundsData: Array<Pick<Refund, 'id' | 'status' | 'amount' | 'processedAt' | 'createdAt'>> = [];
      try {
        const refundsSnap = await db
          .collectionGroup('refunds')
          .where('status', '==', 'processed')
          .get();
        for (const doc of refundsSnap.docs) {
          const rData = doc.data();
          const processedAt =
            rData.processedAt instanceof Date
              ? rData.processedAt
              : typeof rData.processedAt?.toDate === 'function'
                ? rData.processedAt.toDate()
                : rData.processedAt
                  ? new Date(rData.processedAt)
                  : null;

          if (processedAt && processedAt >= start && processedAt <= end) {
            refundsData.push({
              id: doc.id,
              status: 'processed',
              amount: rData.amount ?? 0,
              processedAt,
              createdAt: rData.createdAt ? new Date(rData.createdAt) : new Date(),
            });
          }
        }
      } catch {
        refundsData = [];
      }

      domainData = computeSalesAnalytics(ordersData as any, refundsData);
      break;
    }

    case 'products': {
      const ordersWithItems: OrderWithItemsForRollup[] = [];
      for (const o of ordersData) {
        let items: OrderWithItemsForRollup['items'] = [];
        try {
          const itemsSnap = await o.ref.collection('items').get();
          items = itemsSnap.docs.map((iDoc: any) => {
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
          ...(o as any),
          items,
        });
      }
      domainData = computeProductsAnalytics(ordersWithItems);
      break;
    }

    case 'customers': {
      const pastSnap = await db
        .collection('orders')
        .where('paymentStatus', '==', 'paid')
        .where('placedAt', '<', start)
        .get();

      const allPriorUserIds = new Set<string>();
      for (const d of pastSnap.docs) {
        const u = d.data().userId;
        if (u) allPriorUserIds.add(u);
      }

      domainData = computeCustomersAnalytics(ordersData as any, allPriorUserIds);
      break;
    }

    case 'marketing': {
      domainData = computeMarketingAnalytics(ordersData as any);
      break;
    }

    case 'personalization': {
      let customizations: Array<Pick<Customization, 'textFieldsJson' | 'clipartId' | 'dpiBand'>> = [];
      try {
        const custSnap = await db.collection('customizations').get();
        customizations = custSnap.docs.map((d) => d.data() as any);
      } catch {
        customizations = [];
      }
      domainData = computePersonalizationAnalytics(customizations);
      break;
    }

    case 'funnel': {
      domainData = computeFunnelAnalytics(ordersData as any, new Date());
      break;
    }

    case 'operations': {
      let returnsData: Array<Pick<Return, 'status' | 'reasonCategory'>> = [];
      let printJobsData: Array<Pick<PrintJob, 'status'>> = [];
      try {
        const returnsSnap = await db.collection('returns').get();
        returnsData = returnsSnap.docs.map((d) => d.data() as any);
      } catch {
        returnsData = [];
      }
      try {
        const pjSnap = await db.collection('printJobs').get();
        printJobsData = pjSnap.docs.map((d) => d.data() as any);
      } catch {
        printJobsData = [];
      }

      domainData = computeOperationsAnalytics(ordersData as any, returnsData, printJobsData);
      break;
    }
  }

  return NextResponse.json(
    {
      domain,
      from: fromStr,
      to: toStr,
      data: domainData,
    },
    { status: 200 }
  );
}

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  computeDailyRollup,
  IST_OFFSET_MS,
  type OrderWithItemsForRollup,
  type AnalyticsDaily,
} from '@bro-pics/shared';

export interface DailyRollupDeps {
  fetchOrdersForDay(start: Date, end: Date): Promise<OrderWithItemsForRollup[]>;
  fetchRefundsForDay(start: Date, end: Date): Promise<Array<{ id: string; status: 'processed'; amount: number }>>;
  fetchPastCustomerIds(beforeDate: Date): Promise<Set<string>>;
  writeDailyRollup(dateStr: string, rollup: AnalyticsDaily): Promise<void>;
}

export function parseIstDayRange(dateStr: string): { start: Date; end: Date } {
  // dateStr is "YYYY-MM-DD"
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
 * [ABE-29 / ANL-05] Executes an idempotent roll-up for a specific IST date.
 * Reconciles exactly with orders placed on that day.
 */
export async function executeDailyRollup(
  deps: DailyRollupDeps,
  dateStr: string,
  runAt: Date = new Date()
): Promise<AnalyticsDaily> {
  const { start, end } = parseIstDayRange(dateStr);
  const [orders, refunds, pastCustomerIds] = await Promise.all([
    deps.fetchOrdersForDay(start, end),
    deps.fetchRefundsForDay(start, end),
    deps.fetchPastCustomerIds(start),
  ]);

  const rollup = computeDailyRollup(dateStr, orders, refunds, pastCustomerIds, runAt);
  await deps.writeDailyRollup(dateStr, rollup);
  return rollup;
}

/**
 * Back-fills daily roll-ups across a date range inclusive.
 */
export async function backfillDailyRollups(
  deps: DailyRollupDeps,
  fromDateStr: string,
  toDateStr: string
): Promise<{ processedDays: string[]; rollups: AnalyticsDaily[] }> {
  const current = new Date(`${fromDateStr}T00:00:00Z`);
  const end = new Date(`${toDateStr}T00:00:00Z`);
  const processedDays: string[] = [];
  const rollups: AnalyticsDaily[] = [];

  while (current <= end) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, '0');
    const d = String(current.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const rollup = await executeDailyRollup(deps, dateStr);
    processedDays.push(dateStr);
    rollups.push(rollup);

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return { processedDays, rollups };
}

export function createFirestoreDailyRollupDeps(db: Firestore): DailyRollupDeps {
  return {
    async fetchOrdersForDay(start: Date, end: Date) {
      const snap = await db
        .collection('orders')
        .where('placedAt', '>=', start)
        .where('placedAt', '<=', end)
        .get();

      const ordersWithItems: OrderWithItemsForRollup[] = [];

      for (const doc of snap.docs) {
        const orderData = doc.data() as OrderWithItemsForRollup;
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
          status: orderData.status,
          paymentStatus: orderData.paymentStatus,
          paymentMode: orderData.paymentMode ?? 'prepaid',
          total: orderData.total ?? 0,
          discount: orderData.discount ?? 0,
          shipping: orderData.shipping ?? 0,
          taxLines: orderData.taxLines ?? [],
          userId: orderData.userId ?? '',
          items,
        });
      }

      return ordersWithItems;
    },

    async fetchRefundsForDay(start: Date, end: Date) {
      try {
        const snap = await db
          .collectionGroup('refunds')
          .where('status', '==', 'processed')
          .get();

        const results: Array<{ id: string; status: 'processed'; amount: number }> = [];
        for (const doc of snap.docs) {
          const data = doc.data();
          const processedAt =
            data.processedAt instanceof Date
              ? data.processedAt
              : typeof data.processedAt?.toDate === 'function'
                ? data.processedAt.toDate()
                : data.processedAt
                  ? new Date(data.processedAt)
                  : null;

          if (processedAt && processedAt >= start && processedAt <= end) {
            results.push({
              id: doc.id,
              status: 'processed',
              amount: data.amount ?? 0,
            });
          }
        }
        return results;
      } catch {
        return [];
      }
    },

    async fetchPastCustomerIds(beforeDate: Date) {
      const snap = await db
        .collection('orders')
        .where('paymentStatus', '==', 'paid')
        .where('placedAt', '<', beforeDate)
        .get();

      const ids = new Set<string>();
      for (const doc of snap.docs) {
        const data = doc.data();
        if (data.userId) {
          ids.add(data.userId);
        }
      }
      return ids;
    },

    async writeDailyRollup(dateStr: string, rollup: AnalyticsDaily) {
      await db.collection('analyticsDaily').doc(dateStr).set(rollup);
    },
  };
}

/**
 * Scheduled Cloud Function running daily at 00:30 IST (19:00 UTC).
 * Rolls up the completed previous day's metrics.
 */
export const rollupDailyAnalytics = onSchedule('every day 19:00', async () => {
  const db = getFirestore();
  const deps = createFirestoreDailyRollupDeps(db);

  // Compute yesterday's IST date string
  const yesterdayIst = new Date(Date.now() - 24 * 60 * 60 * 1000 + IST_OFFSET_MS);
  const y = yesterdayIst.getUTCFullYear();
  const m = String(yesterdayIst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(yesterdayIst.getUTCDate()).padStart(2, '0');
  const yesterdayStr = `${y}-${m}-${d}`;

  await executeDailyRollup(deps, yesterdayStr);
});

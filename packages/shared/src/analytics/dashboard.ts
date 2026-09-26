import { OrderStatusSchema, type Order, type OrderStatus } from '../schemas/order';
import { type Refund } from '../schemas/refund';

export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export interface IstDayRange {
  start: Date;
  end: Date;
  dateStr: string;
}

/**
 * Returns the exact UTC start and end bounds for the Indian Standard Time (IST)
 * day corresponding to the given reference date (defaults to current time).
 */
export function getIstDayRange(now: Date = new Date()): IstDayRange {
  const istTime = new Date(now.getTime() + IST_OFFSET_MS);
  const year = istTime.getUTCFullYear();
  const monthIdx = istTime.getUTCMonth();
  const day = istTime.getUTCDate();

  const monthStr = String(monthIdx + 1).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  const dateStr = `${year}-${monthStr}-${dayStr}`;

  const startUtcMs = Date.UTC(year, monthIdx, day, 0, 0, 0, 0) - IST_OFFSET_MS;
  const endUtcMs = Date.UTC(year, monthIdx, day, 23, 59, 59, 999) - IST_OFFSET_MS;

  return {
    start: new Date(startUtcMs),
    end: new Date(endUtcMs),
    dateStr,
  };
}

export interface TodayRevenueMetrics {
  date: string;
  orderCount: number;
  grossRevenue: number;
  refundsTotal: number;
  netRevenue: number;
  aov: number;
}

export function computeTodayRevenue(
  ordersPlacedToday: Array<Pick<Order, 'id' | 'paymentStatus' | 'total'>>,
  refundsProcessedToday: Array<Pick<Refund, 'id' | 'status' | 'amount'>>,
  dateStr: string
): TodayRevenueMetrics {
  const paidOrders = ordersPlacedToday.filter((o) => o.paymentStatus === 'paid');
  const orderCount = paidOrders.length;
  const grossRevenue = paidOrders.reduce((sum, o) => sum + o.total, 0);

  const processedRefunds = refundsProcessedToday.filter((r) => r.status === 'processed');
  const refundsTotal = processedRefunds.reduce((sum, r) => sum + r.amount, 0);

  const netRevenue = Math.max(0, grossRevenue - refundsTotal);
  const aov = orderCount > 0 ? Math.round(netRevenue / orderCount) : 0;

  return {
    date: dateStr,
    orderCount,
    grossRevenue,
    refundsTotal,
    netRevenue,
    aov,
  };
}

export function computeProductionStatusCounts(
  orders: Array<{ status: OrderStatus }>
): Record<OrderStatus, number> {
  const initialCounts = OrderStatusSchema.options.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as Record<OrderStatus, number>);

  for (const order of orders) {
    if (order.status in initialCounts) {
      initialCounts[order.status]++;
    }
  }

  return initialCounts;
}

export interface OperationalAlert {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  count: number;
  message: string;
}

export interface OperationalAlertCounts {
  failedRenders: number;
  stuckPendingOrders: number;
  photoValidationOrders: number;
  reworkOrders: number;
  failedRefunds: number;
  pendingRefunds: number;
  openReturns: number;
  pendingReviews: number;
}

export function buildOperationalAlerts(counts: OperationalAlertCounts): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  if (counts.failedRenders > 0) {
    alerts.push({
      id: 'failed_renders',
      type: 'render_failure',
      severity: 'critical',
      title: 'Failed Print Jobs',
      count: counts.failedRenders,
      message: `${counts.failedRenders} print job${counts.failedRenders === 1 ? '' : 's'} failed rendering and require re-render or review.`,
    });
  }

  if (counts.failedRefunds > 0) {
    alerts.push({
      id: 'failed_refunds',
      type: 'refund_failure',
      severity: 'critical',
      title: 'Failed Refunds',
      count: counts.failedRefunds,
      message: `${counts.failedRefunds} refund${counts.failedRefunds === 1 ? '' : 's'} failed processing through Razorpay.`,
    });
  }

  if (counts.reworkOrders > 0) {
    alerts.push({
      id: 'rework_orders',
      type: 'rework',
      severity: 'warning',
      title: 'Orders in Rework',
      count: counts.reworkOrders,
      message: `${counts.reworkOrders} order${counts.reworkOrders === 1 ? '' : 's'} failed QC and sent for rework.`,
    });
  }

  if (counts.photoValidationOrders > 0) {
    alerts.push({
      id: 'photo_validation',
      type: 'photo_validation',
      severity: 'warning',
      title: 'Photo Validation Hold',
      count: counts.photoValidationOrders,
      message: `${counts.photoValidationOrders} order${counts.photoValidationOrders === 1 ? '' : 's'} held on low-DPI / photo validation.`,
    });
  }

  if (counts.stuckPendingOrders > 0) {
    alerts.push({
      id: 'stuck_pending',
      type: 'stuck_payment',
      severity: 'warning',
      title: 'Stuck Pending Payment',
      count: counts.stuckPendingOrders,
      message: `${counts.stuckPendingOrders} order${counts.stuckPendingOrders === 1 ? '' : 's'} pending payment for over 30 minutes.`,
    });
  }

  if (counts.openReturns > 0) {
    alerts.push({
      id: 'open_returns',
      type: 'returns',
      severity: 'warning',
      title: 'Open Returns',
      count: counts.openReturns,
      message: `${counts.openReturns} customer return${counts.openReturns === 1 ? '' : 's'} awaiting inspection or pickup.`,
    });
  }

  if (counts.pendingRefunds > 0) {
    alerts.push({
      id: 'pending_refunds',
      type: 'pending_refunds',
      severity: 'info',
      title: 'Pending Refunds',
      count: counts.pendingRefunds,
      message: `${counts.pendingRefunds} proposed refund${counts.pendingRefunds === 1 ? '' : 's'} awaiting staff approval.`,
    });
  }

  if (counts.pendingReviews > 0) {
    alerts.push({
      id: 'pending_reviews',
      type: 'pending_reviews',
      severity: 'info',
      title: 'Pending Reviews',
      count: counts.pendingReviews,
      message: `${counts.pendingReviews} review${counts.pendingReviews === 1 ? '' : 's'} in moderation queue.`,
    });
  }

  return alerts;
}

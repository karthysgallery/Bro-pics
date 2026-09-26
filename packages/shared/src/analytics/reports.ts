import { type Order } from '../schemas/order';
import { type Refund } from '../schemas/refund';
import { type Return, type ReturnReasonCategory } from '../schemas/return';
import { type PrintJob } from '../schemas/print-job';
import { type Customization } from '../schemas/customization';
import { type OrderWithItemsForRollup } from './daily-rollup';

// 1. Sales Analytics
export interface SalesAnalytics {
  grossRevenue: number;
  netRevenue: number;
  totalDiscounts: number;
  totalShipping: number;
  totalTax: number;
  totalRefunds: number;
  orderCount: number;
  paidOrderCount: number;
  cancelledOrderCount: number;
  aov: number;
  paymentModes: {
    prepaid: { count: number; revenue: number };
    partialCod: { count: number; revenue: number };
  };
  dailyTrend: Array<{
    date: string;
    gross: number;
    net: number;
    orders: number;
    aov: number;
  }>;
}

export function computeSalesAnalytics(
  orders: Array<Pick<Order, 'id' | 'status' | 'paymentStatus' | 'paymentMode' | 'total' | 'discount' | 'shipping' | 'taxLines' | 'placedAt'>>,
  refunds: Array<Pick<Refund, 'id' | 'status' | 'amount' | 'processedAt' | 'createdAt'>>
): SalesAnalytics {
  const paidOrders = orders.filter((o) => o.paymentStatus === 'paid');
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled');

  const grossRevenue = paidOrders.reduce((sum, o) => sum + o.total, 0);
  const totalDiscounts = paidOrders.reduce((sum, o) => sum + (o.discount ?? 0), 0);
  const totalShipping = paidOrders.reduce((sum, o) => sum + (o.shipping ?? 0), 0);
  const totalTax = paidOrders.reduce(
    (sum, o) => sum + (o.taxLines ?? []).reduce((t, l) => t + (l.amount ?? 0), 0),
    0
  );

  const processedRefunds = refunds.filter((r) => r.status === 'processed');
  const totalRefunds = processedRefunds.reduce((sum, r) => sum + r.amount, 0);
  const netRevenue = Math.max(0, grossRevenue - totalRefunds);
  const aov = paidOrders.length > 0 ? Math.round(netRevenue / paidOrders.length) : 0;

  // Payment modes breakdown
  const prepaidOrders = paidOrders.filter((o) => o.paymentMode === 'prepaid');
  const partialCodOrders = paidOrders.filter((o) => o.paymentMode === 'partial_cod');

  const paymentModes = {
    prepaid: {
      count: prepaidOrders.length,
      revenue: prepaidOrders.reduce((s, o) => s + o.total, 0),
    },
    partialCod: {
      count: partialCodOrders.length,
      revenue: partialCodOrders.reduce((s, o) => s + o.total, 0),
    },
  };

  // Group by date (YYYY-MM-DD)
  const byDate: Record<string, { gross: number; refunds: number; orders: number }> = {};
  for (const o of paidOrders) {
    const d = o.placedAt instanceof Date ? o.placedAt : new Date(o.placedAt);
    const dateStr = d.toISOString().split('T')[0];
    if (!byDate[dateStr]) byDate[dateStr] = { gross: 0, refunds: 0, orders: 0 };
    byDate[dateStr].gross += o.total;
    byDate[dateStr].orders += 1;
  }
  for (const r of processedRefunds) {
    const d = r.processedAt ?? r.createdAt ?? new Date();
    const dateObj = d instanceof Date ? d : new Date(d);
    const dateStr = dateObj.toISOString().split('T')[0];
    if (!byDate[dateStr]) byDate[dateStr] = { gross: 0, refunds: 0, orders: 0 };
    byDate[dateStr].refunds += r.amount;
  }

  const dailyTrend = Object.keys(byDate)
    .sort()
    .map((date) => {
      const g = byDate[date].gross;
      const ref = byDate[date].refunds;
      const net = Math.max(0, g - ref);
      const cnt = byDate[date].orders;
      return {
        date,
        gross: g,
        net,
        orders: cnt,
        aov: cnt > 0 ? Math.round(net / cnt) : 0,
      };
    });

  return {
    grossRevenue,
    netRevenue,
    totalDiscounts,
    totalShipping,
    totalTax,
    totalRefunds,
    orderCount: orders.length,
    paidOrderCount: paidOrders.length,
    cancelledOrderCount: cancelledOrders.length,
    aov,
    paymentModes,
    dailyTrend,
  };
}

// 2. Products Analytics
export interface ProductPerformance {
  productId: string;
  title: string;
  unitsSold: number;
  revenue: number;
}

export interface ProductsAnalytics {
  totalUnitsSold: number;
  totalProductsWithSales: number;
  topProducts: ProductPerformance[];
}

export function computeProductsAnalytics(orders: OrderWithItemsForRollup[]): ProductsAnalytics {
  const paidOrders = orders.filter((o) => o.paymentStatus === 'paid');
  const productMap: Record<string, ProductPerformance> = {};
  let totalUnitsSold = 0;

  for (const order of paidOrders) {
    if (order.items && Array.isArray(order.items)) {
      for (const item of order.items) {
        totalUnitsSold += item.quantity;
        if (!productMap[item.productId]) {
          productMap[item.productId] = {
            productId: item.productId,
            title: item.title || item.productId,
            unitsSold: 0,
            revenue: 0,
          };
        }
        productMap[item.productId].unitsSold += item.quantity;
        productMap[item.productId].revenue += item.quantity * item.price;
      }
    }
  }

  const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);

  return {
    totalUnitsSold,
    totalProductsWithSales: topProducts.length,
    topProducts,
  };
}

// 3. Customers Analytics
export interface CustomerSpendStat {
  userId: string;
  orderCount: number;
  totalSpent: number;
}

export interface CustomersAnalytics {
  uniqueCustomers: number;
  newCustomers: number;
  repeatCustomers: number;
  repeatCustomerRate: number;
  frequencyDistribution: {
    singleOrder: number;
    twoOrders: number;
    threeOrMoreOrders: number;
  };
  topCustomers: CustomerSpendStat[];
}

export function computeCustomersAnalytics(
  currentPeriodOrders: Array<Pick<Order, 'userId' | 'paymentStatus' | 'total'>>,
  allPriorUserIds: Set<string> = new Set()
): CustomersAnalytics {
  const paidOrders = currentPeriodOrders.filter((o) => o.paymentStatus === 'paid');
  const userOrderMap: Record<string, { count: number; total: number }> = {};

  for (const o of paidOrders) {
    if (!o.userId) continue;
    if (!userOrderMap[o.userId]) {
      userOrderMap[o.userId] = { count: 0, total: 0 };
    }
    userOrderMap[o.userId].count++;
    userOrderMap[o.userId].total += o.total;
  }

  const uniqueUserIds = Object.keys(userOrderMap);
  let newCustomers = 0;
  let repeatCustomers = 0;

  let singleOrder = 0;
  let twoOrders = 0;
  let threeOrMoreOrders = 0;

  for (const uid of uniqueUserIds) {
    if (allPriorUserIds.has(uid) || userOrderMap[uid].count > 1) {
      repeatCustomers++;
    } else {
      newCustomers++;
    }

    const c = userOrderMap[uid].count;
    if (c === 1) singleOrder++;
    else if (c === 2) twoOrders++;
    else if (c >= 3) threeOrMoreOrders++;
  }

  const uniqueCustomers = uniqueUserIds.length;
  const repeatCustomerRate =
    uniqueCustomers > 0 ? Math.round((repeatCustomers / uniqueCustomers) * 100) / 100 : 0;

  const topCustomers: CustomerSpendStat[] = Object.entries(userOrderMap)
    .map(([userId, stats]) => ({
      userId,
      orderCount: stats.count,
      totalSpent: stats.total,
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 10);

  return {
    uniqueCustomers,
    newCustomers,
    repeatCustomers,
    repeatCustomerRate,
    frequencyDistribution: {
      singleOrder,
      twoOrders,
      threeOrMoreOrders,
    },
    topCustomers,
  };
}

// 4. Marketing Analytics
export interface CouponPerformance {
  code: string;
  orderCount: number;
  totalDiscount: number;
  attributedRevenue: number;
}

export interface MarketingAnalytics {
  totalOrdersWithCoupon: number;
  couponPenetrationRate: number;
  totalCouponDiscount: number;
  coupons: CouponPerformance[];
}

export function computeMarketingAnalytics(
  orders: Array<Pick<Order, 'couponId' | 'discount' | 'total' | 'paymentStatus'>>
): MarketingAnalytics {
  const paidOrders = orders.filter((o) => o.paymentStatus === 'paid');
  const couponMap: Record<string, CouponPerformance> = {};
  let totalOrdersWithCoupon = 0;
  let totalCouponDiscount = 0;

  for (const o of paidOrders) {
    if (o.couponId && (o.discount ?? 0) > 0) {
      totalOrdersWithCoupon++;
      totalCouponDiscount += o.discount;

      const code = o.couponId;
      if (!couponMap[code]) {
        couponMap[code] = {
          code,
          orderCount: 0,
          totalDiscount: 0,
          attributedRevenue: 0,
        };
      }
      couponMap[code].orderCount++;
      couponMap[code].totalDiscount += o.discount;
      couponMap[code].attributedRevenue += o.total;
    }
  }

  const couponPenetrationRate =
    paidOrders.length > 0 ? Math.round((totalOrdersWithCoupon / paidOrders.length) * 100) / 100 : 0;

  const coupons = Object.values(couponMap).sort((a, b) => b.attributedRevenue - a.attributedRevenue);

  return {
    totalOrdersWithCoupon,
    couponPenetrationRate,
    totalCouponDiscount,
    coupons,
  };
}

// 5. Personalization Analytics
export interface PersonalizationAnalytics {
  totalCustomizations: number;
  textPersonalizationCount: number;
  textPersonalizationRate: number;
  clipartUsageCount: number;
  dpiDistribution: {
    green: number;
    amber: number;
    red: number;
  };
}

export function computePersonalizationAnalytics(
  customizations: Array<Pick<Customization, 'textFieldsJson' | 'clipartId' | 'dpiBand'>>
): PersonalizationAnalytics {
  const totalCustomizations = customizations.length;
  let textPersonalizationCount = 0;
  let clipartUsageCount = 0;
  const dpiDistribution = { green: 0, amber: 0, red: 0 };

  for (const c of customizations) {
    if (c.textFieldsJson && Object.keys(c.textFieldsJson).length > 0) {
      textPersonalizationCount++;
    }
    if (c.clipartId) {
      clipartUsageCount++;
    }
    if (c.dpiBand && c.dpiBand in dpiDistribution) {
      dpiDistribution[c.dpiBand]++;
    }
  }

  const textPersonalizationRate =
    totalCustomizations > 0
      ? Math.round((textPersonalizationCount / totalCustomizations) * 100) / 100
      : 0;

  return {
    totalCustomizations,
    textPersonalizationCount,
    textPersonalizationRate,
    clipartUsageCount,
    dpiDistribution,
  };
}

// 6. Funnel Analytics
export interface FunnelAnalytics {
  ordersInitiated: number;
  ordersPaid: number;
  ordersCancelled: number;
  ordersStuckPending: number;
  conversionRate: number;
  cancellationRate: number;
  dropoffRate: number;
}

export function computeFunnelAnalytics(
  orders: Array<Pick<Order, 'status' | 'paymentStatus' | 'placedAt'>>,
  now: Date = new Date()
): FunnelAnalytics {
  const ordersInitiated = orders.length;
  const ordersPaid = orders.filter((o) => o.paymentStatus === 'paid').length;
  const ordersCancelled = orders.filter((o) => o.status === 'cancelled').length;

  const thresholdMs = 30 * 60 * 1000;
  const ordersStuckPending = orders.filter(
    (o) =>
      o.status === 'pending_payment' &&
      now.getTime() - (o.placedAt instanceof Date ? o.placedAt.getTime() : new Date(o.placedAt).getTime()) >
        thresholdMs
  ).length;

  const conversionRate =
    ordersInitiated > 0 ? Math.round((ordersPaid / ordersInitiated) * 100) / 100 : 0;
  const cancellationRate =
    ordersInitiated > 0 ? Math.round((ordersCancelled / ordersInitiated) * 100) / 100 : 0;
  const dropoffRate =
    ordersInitiated > 0 ? Math.round((ordersStuckPending / ordersInitiated) * 100) / 100 : 0;

  return {
    ordersInitiated,
    ordersPaid,
    ordersCancelled,
    ordersStuckPending,
    conversionRate,
    cancellationRate,
    dropoffRate,
  };
}

// 7. Operations Analytics
export interface OperationsAnalytics {
  ordersTotal: number;
  returnsCount: number;
  returnsRate: number;
  reasonsBreakdown: Record<string, number>;
  printJobs: {
    total: number;
    done: number;
    failed: number;
    queued: number;
    successRate: number;
  };
  qcMetrics: {
    packedCount: number;
    reworkCount: number;
    passRate: number;
  };
}

export function computeOperationsAnalytics(
  orders: Array<Pick<Order, 'status' | 'paymentStatus'>>,
  returns: Array<Pick<Return, 'status' | 'reasonCategory'>>,
  printJobs: Array<Pick<PrintJob, 'status'>>
): OperationsAnalytics {
  const paidOrders = orders.filter((o) => o.paymentStatus === 'paid');
  const returnsCount = returns.length;
  const returnsRate =
    paidOrders.length > 0 ? Math.round((returnsCount / paidOrders.length) * 100) / 100 : 0;

  const reasonsBreakdown: Record<string, number> = {};
  for (const r of returns) {
    const cat = r.reasonCategory || 'other';
    reasonsBreakdown[cat] = (reasonsBreakdown[cat] || 0) + 1;
  }

  const pjTotal = printJobs.length;
  const pjDone = printJobs.filter((pj) => pj.status === 'done').length;
  const pjFailed = printJobs.filter(
    (pj) => pj.status === 'failed' || pj.status === 'failed_permanent'
  ).length;
  const pjQueued = printJobs.filter((pj) => pj.status === 'queued' || pj.status === 'leased').length;
  const pjSuccessRate = pjTotal > 0 ? Math.round((pjDone / pjTotal) * 100) / 100 : 0;

  const packedCount = orders.filter((o) => o.status === 'packed' || o.status === 'printed_packed').length;
  const reworkCount = orders.filter((o) => o.status === 'rework').length;
  const totalQcAttempted = packedCount + reworkCount;
  const qcPassRate =
    totalQcAttempted > 0 ? Math.round((packedCount / totalQcAttempted) * 100) / 100 : 1;

  return {
    ordersTotal: orders.length,
    returnsCount,
    returnsRate,
    reasonsBreakdown,
    printJobs: {
      total: pjTotal,
      done: pjDone,
      failed: pjFailed,
      queued: pjQueued,
      successRate: pjSuccessRate,
    },
    qcMetrics: {
      packedCount,
      reworkCount,
      passRate: qcPassRate,
    },
  };
}

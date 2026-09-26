import { AnalyticsDailySchema, type AnalyticsDaily } from '../schemas/analytics-daily';
import { type Order } from '../schemas/order';
import { type Refund } from '../schemas/refund';

export interface OrderItemForRollup {
  productId: string;
  title?: string;
  quantity: number;
  price: number;
}

export interface OrderWithItemsForRollup extends Pick<
  Order,
  | 'id'
  | 'status'
  | 'paymentStatus'
  | 'paymentMode'
  | 'total'
  | 'discount'
  | 'shipping'
  | 'taxLines'
  | 'userId'
> {
  items?: OrderItemForRollup[];
}

/**
 * [ABE-29 / ANL-05] Pure roll-up calculation reconciling exactly with orders.
 * Idempotent: identical input orders and refunds always generate an identical
 * daily analytics record.
 */
export function computeDailyRollup(
  dateStr: string,
  orders: OrderWithItemsForRollup[],
  refunds: Array<Pick<Refund, 'id' | 'status' | 'amount'>>,
  pastCustomerIds: Set<string> = new Set(),
  runAt: Date = new Date()
): AnalyticsDaily {
  const reconciledOrderIds = orders.map((o) => o.id).sort();

  const totalOrders = orders.length;
  const paidOrders = orders.filter((o) => o.paymentStatus === 'paid');
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled');
  const pendingOrders = orders.filter((o) => o.status === 'pending_payment');
  const refundedOrders = orders.filter((o) => o.status === 'refunded');

  const grossRevenue = paidOrders.reduce((sum, o) => sum + o.total, 0);
  const totalDiscounts = paidOrders.reduce((sum, o) => sum + (o.discount ?? 0), 0);
  const totalShipping = paidOrders.reduce((sum, o) => sum + (o.shipping ?? 0), 0);
  const totalTax = paidOrders.reduce(
    (sum, o) => sum + (o.taxLines ?? []).reduce((tSum, line) => tSum + (line.amount ?? 0), 0),
    0
  );

  const processedRefunds = refunds.filter((r) => r.status === 'processed');
  const totalRefunds = processedRefunds.reduce((sum, r) => sum + r.amount, 0);
  const netRevenue = Math.max(0, grossRevenue - totalRefunds);
  const aov = paidOrders.length > 0 ? Math.round(netRevenue / paidOrders.length) : 0;

  const prepaidCount = paidOrders.filter((o) => o.paymentMode === 'prepaid').length;
  const partialCodCount = paidOrders.filter((o) => o.paymentMode === 'partial_cod').length;

  let totalUnitsSold = 0;
  const byProduct: AnalyticsDaily['products']['byProduct'] = {};

  for (const order of paidOrders) {
    if (order.items && Array.isArray(order.items)) {
      for (const item of order.items) {
        totalUnitsSold += item.quantity;
        const existing = byProduct[item.productId] ?? {
          title: item.title,
          units: 0,
          revenue: 0,
        };
        existing.units += item.quantity;
        existing.revenue += item.quantity * item.price;
        if (!existing.title && item.title) {
          existing.title = item.title;
        }
        byProduct[item.productId] = existing;
      }
    }
  }

  const uniqueCustomerIds = new Set(paidOrders.map((o) => o.userId).filter(Boolean));
  let newCustomers = 0;
  let repeatCustomers = 0;

  for (const uid of uniqueCustomerIds) {
    if (pastCustomerIds.has(uid)) {
      repeatCustomers++;
    } else {
      newCustomers++;
    }
  }

  const rawResult = {
    id: dateStr,
    date: dateStr,
    orders: {
      total: totalOrders,
      paid: paidOrders.length,
      cancelled: cancelledOrders.length,
      pending: pendingOrders.length,
      refunded: refundedOrders.length,
    },
    revenue: {
      gross: grossRevenue,
      discounts: totalDiscounts,
      shipping: totalShipping,
      tax: totalTax,
      refunds: totalRefunds,
      net: netRevenue,
      aov,
    },
    paymentModes: {
      prepaid: prepaidCount,
      partialCod: partialCodCount,
    },
    products: {
      unitsSold: totalUnitsSold,
      byProduct,
    },
    customers: {
      totalOrders: paidOrders.length,
      uniqueCustomers: uniqueCustomerIds.size,
      newCustomers,
      repeatCustomers,
    },
    reconciledOrderIds,
    reconciledAt: runAt,
    version: 1,
  };

  return AnalyticsDailySchema.parse(rawResult);
}

import { z } from 'zod';

export const AnalyticsDailyProductStatSchema = z.object({
  title: z.string().optional(),
  units: z.number().int().nonnegative(),
  revenue: z.number().int().nonnegative(),
});

export const AnalyticsDailySchema = z.object({
  id: z.string(), // YYYY-MM-DD
  date: z.string(), // YYYY-MM-DD
  orders: z.object({
    total: z.number().int().nonnegative(),
    paid: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    refunded: z.number().int().nonnegative(),
  }),
  revenue: z.object({
    gross: z.number().int().nonnegative(),
    discounts: z.number().int().nonnegative(),
    shipping: z.number().int().nonnegative(),
    tax: z.number().int().nonnegative(),
    refunds: z.number().int().nonnegative(),
    net: z.number().int().nonnegative(),
    aov: z.number().int().nonnegative(),
  }),
  paymentModes: z.object({
    prepaid: z.number().int().nonnegative(),
    partialCod: z.number().int().nonnegative(),
  }),
  products: z.object({
    unitsSold: z.number().int().nonnegative(),
    byProduct: z.record(z.string(), AnalyticsDailyProductStatSchema),
  }),
  customers: z.object({
    totalOrders: z.number().int().nonnegative(),
    uniqueCustomers: z.number().int().nonnegative(),
    newCustomers: z.number().int().nonnegative(),
    repeatCustomers: z.number().int().nonnegative(),
  }),
  reconciledOrderIds: z.array(z.string()),
  reconciledAt: z.date(),
  version: z.number().int().positive().default(1),
});

export type AnalyticsDaily = z.infer<typeof AnalyticsDailySchema>;
export type AnalyticsDailyProductStat = z.infer<typeof AnalyticsDailyProductStatSchema>;

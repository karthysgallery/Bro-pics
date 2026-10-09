import { z } from 'zod';

/**
 * "What does the website cost to run?" — shared pieces for the admin Running
 * costs page. Google does not let a site read its own bill directly; the
 * figures arrive two ways, both set up once in the Google Cloud console:
 *
 *  1. Budget alerts (Pub/Sub): Google sends the month-to-date total for the
 *     project a few times a day, including what was spent before setup.
 *  2. Billing export to BigQuery: the cost per service and per day, from the
 *     day the export is switched on.
 *
 * Amounts are in the billing account's own currency (INR here), in rupees
 * (not paise): they are Google's figures, shown as Google reports them.
 */

/** Google's budget notification (the Pub/Sub message body). */
export const BudgetNotificationSchema = z.object({
  budgetDisplayName: z.string().default('Budget'),
  costAmount: z.number(),
  costIntervalStart: z.string(),
  budgetAmount: z.number(),
  budgetAmountType: z.string().optional(),
  currencyCode: z.string().min(3).max(3),
  alertThresholdExceeded: z.number().optional(),
  forecastThresholdExceeded: z.number().optional(),
});
export type BudgetNotification = z.infer<typeof BudgetNotificationSchema>;

/** What is stored in Firestore (`ops/runningCosts`) from the latest budget alert. */
export interface BudgetSnapshot {
  budgetName: string;
  currency: string;
  /** Spend so far in the budget period (normally this calendar month). */
  costAmount: number;
  budgetAmount: number;
  /** Start of the budget period, ISO. */
  periodStart: string;
  /** YYYY-MM of the period, in India time. */
  month: string;
  updatedAt: string;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** YYYY-MM of a moment, in India time (the shop's month). */
export function monthKeyIST(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function budgetSnapshotFromNotification(n: BudgetNotification, now: Date): BudgetSnapshot {
  return {
    budgetName: n.budgetDisplayName,
    currency: n.currencyCode,
    costAmount: round2(n.costAmount),
    budgetAmount: round2(n.budgetAmount),
    periodStart: n.costIntervalStart,
    month: monthKeyIST(new Date(n.costIntervalStart)),
    updatedAt: now.toISOString(),
  };
}

/**
 * A straight-line estimate of the whole month from the spend so far: what it
 * would come to if the rest of the month costs the same per day. Null in the
 * first day (too little to go on).
 */
export function forecastForMonth(monthToDate: number, now: Date): number | null {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const elapsedDays = ist.getUTCDate() - 1 + (ist.getUTCHours() * 60 + ist.getUTCMinutes()) / 1440;
  if (elapsedDays < 1) return null;
  return round2((monthToDate / elapsedDays) * daysInMonth);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Plain-language names for Google's service names, and what each one does for the shop. */
const SERVICES: Array<{ match: RegExp; label: string; purpose: string }> = [
  { match: /cloud functions|cloud run functions/i, label: 'Background jobs', purpose: 'Order numbers, print dispatch, clean-ups' },
  { match: /cloud run/i, label: 'Website', purpose: 'Runs the shop website and the print-file service' },
  { match: /firestore|datastore/i, label: 'Database', purpose: 'Products, orders, customers and settings' },
  { match: /cloud storage/i, label: 'Photo & file storage', purpose: "Customers' photos, print files and product images" },
  { match: /firebase hosting|hosting/i, label: 'Domain & fast delivery', purpose: 'Serves karthysgallery.in quickly everywhere' },
  { match: /cloud build/i, label: 'Automatic updates', purpose: 'Builds and publishes the website on each update' },
  { match: /artifact registry|container registry/i, label: 'Website versions', purpose: 'Keeps the built website versions' },
  { match: /identity platform|firebase auth|identity toolkit/i, label: 'Sign-in', purpose: 'Customer and staff accounts' },
  { match: /networking|network/i, label: 'Internet traffic', purpose: 'Data sent to visitors' },
  { match: /logging/i, label: 'Logs', purpose: 'Error and activity records' },
  { match: /monitoring/i, label: 'Monitoring', purpose: 'Uptime and health checks' },
  { match: /secret manager/i, label: 'Secure keys', purpose: 'Payment and login secrets' },
  { match: /pub\/?sub/i, label: 'Messaging', purpose: 'Internal notifications between services' },
  { match: /scheduler/i, label: 'Scheduled tasks', purpose: 'Timed jobs such as clean-ups' },
  { match: /bigquery/i, label: 'Cost reports', purpose: 'Stores the billing data for this page' },
  { match: /compute engine/i, label: 'Servers', purpose: 'Build machines and server time' },
];

export function friendlyService(googleName: string): { label: string; purpose: string } {
  const found = SERVICES.find((s) => s.match.test(googleName));
  return found ? { label: found.label, purpose: found.purpose } : { label: googleName, purpose: '' };
}

/** One row of the billing export, already summed per day and service. */
export interface ExportRow {
  month: string;
  day: string;
  service: string;
  currency: string;
  /** Cost after credits (free tier, promotions). */
  net: number;
}

export interface ServiceCost {
  service: string;
  label: string;
  purpose: string;
  amount: number;
}

export interface RunningCosts {
  currency: string;
  month: string;
  /** Month-to-date spend: from the budget alert when available (complete), else the export. */
  monthToDate: number | null;
  monthToDateSource: 'budget' | 'export' | null;
  forecast: number | null;
  budget: { name: string; amount: number; updatedAt: string } | null;
  /** This month, per service (export only), largest first. */
  byService: ServiceCost[];
  /** This month, per day (export only). */
  daily: Array<{ day: string; amount: number }>;
  /** Up to six months, oldest first (export, plus the budget's months). */
  months: Array<{ month: string; amount: number }>;
  exportConfigured: boolean;
  budgetConfigured: boolean;
  /** When the export's newest figure is from (it runs about a day behind). */
  exportLatestDay: string | null;
}

/**
 * Combines what is known into one picture. The budget alert's month total is
 * preferred because it includes spend from before the export was switched on;
 * the export adds the per-service and per-day detail.
 */
export function combineRunningCosts(input: {
  now: Date;
  budget: BudgetSnapshot | null;
  budgetMonths: Array<{ month: string; amount: number }>;
  exportRows: ExportRow[] | null;
  fallbackCurrency?: string;
}): RunningCosts {
  const month = monthKeyIST(input.now);
  const rows = input.exportRows ?? [];
  const currency = input.budget?.currency ?? rows[0]?.currency ?? input.fallbackCurrency ?? 'INR';

  const thisMonth = rows.filter((r) => r.month === month);
  const perService = new Map<string, number>();
  const perDay = new Map<string, number>();
  for (const r of thisMonth) {
    perService.set(r.service, (perService.get(r.service) ?? 0) + r.net);
    perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.net);
  }
  const byService = [...perService.entries()]
    .map(([service, amount]) => ({ service, ...friendlyService(service), amount: round2(amount) }))
    .filter((s) => Math.abs(s.amount) >= 0.01)
    .sort((a, b) => b.amount - a.amount);
  const daily = [...perDay.entries()].map(([day, amount]) => ({ day, amount: round2(amount) })).sort((a, b) => a.day.localeCompare(b.day));

  const perMonth = new Map<string, number>();
  for (const r of rows) perMonth.set(r.month, (perMonth.get(r.month) ?? 0) + r.net);
  // A month's budget figure is complete; the export may have started part-way through it.
  for (const m of input.budgetMonths) perMonth.set(m.month, Math.max(m.amount, perMonth.get(m.month) ?? 0));
  const budgetThisMonth = input.budget && input.budget.month === month ? input.budget : null;
  if (budgetThisMonth) perMonth.set(month, Math.max(budgetThisMonth.costAmount, perMonth.get(month) ?? 0));
  const months = [...perMonth.entries()]
    .map(([m, amount]) => ({ month: m, amount: round2(amount) }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);

  const exportTotal = thisMonth.length > 0 ? round2(thisMonth.reduce((sum, r) => sum + r.net, 0)) : null;
  const monthToDate = budgetThisMonth ? budgetThisMonth.costAmount : exportTotal;
  return {
    currency,
    month,
    monthToDate,
    monthToDateSource: budgetThisMonth ? 'budget' : exportTotal !== null ? 'export' : null,
    forecast: monthToDate === null ? null : forecastForMonth(monthToDate, input.now),
    budget: input.budget ? { name: input.budget.budgetName, amount: input.budget.budgetAmount, updatedAt: input.budget.updatedAt } : null,
    byService,
    daily,
    months,
    exportConfigured: input.exportRows !== null,
    budgetConfigured: input.budget !== null,
    exportLatestDay: daily.length > 0 ? daily[daily.length - 1]!.day : null,
  };
}

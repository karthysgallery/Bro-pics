import type { Invoice } from '../schemas/billing';

/**
 * Billing reports from invoices and credit notes — online and in store, the
 * same documents the customer received, so every figure ties back to a bill.
 * Sales are invoice totals; returns/refunds are credit-note totals; net is
 * the difference. Days are India days.
 */

const IST_MS = 5.5 * 3600_000;
export const istDay = (iso: string) => new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 10);

export interface BillingReport {
  bills: number;
  sales: number;
  discounts: number;
  refunds: number;
  net: number;
  byChannel: Record<'online' | 'pos', { bills: number; sales: number; refunds: number }>;
  byPayment: Array<{ method: string; amount: number }>;
  byDay: Array<{ day: string; sales: number; refunds: number; bills: number }>;
  byProduct: Array<{ productId: string; title: string; qty: number; revenue: number }>;
  byCategory: Array<{ categoryId: string; name: string; qty: number; revenue: number }>;
}

export function buildBillingReport(docs: Invoice[], categories: { productCategory: Map<string, string>; names: Map<string, string> } = { productCategory: new Map(), names: new Map() }): BillingReport {
  const invoices = docs.filter((d) => d.kind === 'invoice' && d.status !== 'cancelled');
  const credits = docs.filter((d) => d.kind === 'credit_note');
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const channel = (c: 'online' | 'pos') => ({
    bills: invoices.filter((i) => i.channel === c).length,
    sales: sum(invoices.filter((i) => i.channel === c).map((i) => i.total)),
    refunds: sum(credits.filter((i) => i.channel === c).map((i) => i.total)),
  });
  const pay = new Map<string, number>();
  for (const i of invoices) for (const p of i.payments) pay.set(p.method, (pay.get(p.method) ?? 0) + p.amount);
  for (const c of credits) for (const p of c.payments) pay.set(p.method, (pay.get(p.method) ?? 0) - p.amount);
  const days = new Map<string, { sales: number; refunds: number; bills: number }>();
  const dayOf = (k: string) => days.get(k) ?? days.set(k, { sales: 0, refunds: 0, bills: 0 }).get(k)!;
  for (const i of invoices) {
    const d = dayOf(istDay(i.issuedAt));
    d.sales += i.total;
    d.bills += 1;
  }
  for (const c of credits) dayOf(istDay(c.issuedAt)).refunds += c.total;
  const products = new Map<string, { productId: string; title: string; qty: number; revenue: number }>();
  const addLines = (inv: Invoice, sign: 1 | -1) => {
    for (const l of inv.lines) {
      if (l.productId === 'refund') continue;
      const p = products.get(l.productId) ?? { productId: l.productId, title: l.title, qty: 0, revenue: 0 };
      p.qty += sign * l.qty;
      p.revenue += sign * l.lineTotal;
      products.set(l.productId, p);
    }
  };
  invoices.forEach((i) => addLines(i, 1));
  credits.forEach((c) => addLines(c, -1));
  const cats = new Map<string, { categoryId: string; name: string; qty: number; revenue: number }>();
  for (const p of products.values()) {
    const id = categories.productCategory.get(p.productId) ?? 'uncategorised';
    const c = cats.get(id) ?? { categoryId: id, name: categories.names.get(id) ?? (id === 'uncategorised' ? 'Other' : id), qty: 0, revenue: 0 };
    c.qty += p.qty;
    c.revenue += p.revenue;
    cats.set(id, c);
  }
  const sales = sum(invoices.map((i) => i.total));
  const refunds = sum(credits.map((c) => c.total));
  return {
    bills: invoices.length,
    sales,
    discounts: sum(invoices.map((i) => i.discount)),
    refunds,
    net: sales - refunds,
    byChannel: { online: channel('online'), pos: channel('pos') },
    byPayment: [...pay.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
    byDay: [...days.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
    byProduct: [...products.values()].sort((a, b) => b.revenue - a.revenue),
    byCategory: [...cats.values()].sort((a, b) => b.revenue - a.revenue),
  };
}

import { NextResponse } from 'next/server';
import { buildBillingReport, type Invoice } from '@bro-pics/shared';
import { billingDb, guard } from '../../../../../lib/billing/server';

const IST = '+05:30';

/**
 * GET /api/admin/billing/reports?from=YYYY-MM-DD&to=YYYY-MM-DD[&channel=pos]
 * Sales, discounts, returns and net — by channel, payment method, day,
 * product and category. `billing:reports` (owner/admins); the in-store
 * dashboard (channel=pos, today) is allowed with `billing:view`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const channel = url.searchParams.get('channel');
  const g = await guard(request, channel === 'pos' ? 'billing:view' : 'billing:reports');
  if (!g.ok) return g.response;
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const valid = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const fromDay = valid(url.searchParams.get('from')) ?? today;
  const toDay = valid(url.searchParams.get('to')) ?? today;
  const from = new Date(`${fromDay}T00:00:00${IST}`).toISOString();
  const to = new Date(`${toDay}T23:59:59.999${IST}`).toISOString();
  if (from > to) return NextResponse.json({ error: 'The start date is after the end date' }, { status: 400 });
  const db = billingDb();
  const snap = await db.collection('invoices').where('issuedAt', '>=', from).where('issuedAt', '<=', to).limit(10000).get();
  const docs = snap.docs.map((d) => d.data() as Invoice).filter((i) => !channel || i.channel === channel);
  const [products, categories] = await Promise.all([db.collection('products').select('categoryId').get(), db.collection('categories').select('name').get()]);
  const report = buildBillingReport(docs, {
    productCategory: new Map(products.docs.map((p) => [p.id, String(p.get('categoryId') ?? '')])),
    names: new Map(categories.docs.map((c) => [c.id, String(c.get('name') ?? c.id)])),
  });
  return NextResponse.json({ from: fromDay, to: toDay, channel: channel ?? 'all', report, truncated: snap.size === 10000 }, { status: 200 });
}

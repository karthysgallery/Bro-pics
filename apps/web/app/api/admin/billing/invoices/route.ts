import { NextResponse } from 'next/server';
import { INVOICE_STATUSES, type Invoice } from '@bro-pics/shared';
import { billingDb, guard } from '../../../../../lib/billing/server';

const IST = '+05:30';

/**
 * GET /api/admin/billing/invoices — invoice history for both channels.
 * Filters: from/to (YYYY-MM-DD, India time; default last 30 days), channel
 * (online|pos), kind (invoice|credit_note), status, q (invoice no, order no,
 * customer name or phone). Read by date (one simple index), filtered here:
 * plenty for a shop's volume (up to 3,000 documents per query).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'billing:view');
  if (!g.ok) return g.response;
  const url = new URL(request.url);
  const day = (v: string | null, end: boolean) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T${end ? '23:59:59.999' : '00:00:00'}${IST}`).toISOString() : null);
  const from = day(url.searchParams.get('from'), false) ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
  const to = day(url.searchParams.get('to'), true) ?? new Date().toISOString();
  const channel = url.searchParams.get('channel');
  const kind = url.searchParams.get('kind');
  const status = url.searchParams.get('status');
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const db = billingDb();

  // An exact invoice/credit-note number is found directly, whatever its date.
  if (q && /^[a-z0-9-]+-\d{4}-\d{6}$/.test(q)) {
    const lock = await db.collection('invoiceNumbers').doc(q.toUpperCase()).get();
    if (lock.exists) {
      const snap = await db.collection('invoices').where('invoiceNo', '==', q.toUpperCase()).limit(1).get();
      return NextResponse.json({ invoices: snap.docs.map((d) => d.data() as Invoice), truncated: false }, { status: 200 });
    }
  }
  const snap = await db.collection('invoices').where('issuedAt', '>=', from).where('issuedAt', '<=', to).orderBy('issuedAt', 'desc').limit(3000).get();
  const digits = q.replace(/\D/g, '');
  const invoices = snap.docs
    .map((d) => d.data() as Invoice)
    .filter((i) => !channel || i.channel === channel)
    .filter((i) => !kind || i.kind === kind)
    .filter((i) => !status || !(INVOICE_STATUSES as readonly string[]).includes(status) || i.status === status)
    .filter(
      (i) =>
        !q ||
        i.invoiceNo.toLowerCase().includes(q) ||
        (i.orderNo ?? '').toLowerCase().includes(q) ||
        i.customer.name.toLowerCase().includes(q) ||
        (digits.length >= 4 && (i.customer.phone ?? '').includes(digits))
    );
  return NextResponse.json({ invoices: invoices.slice(0, 500), truncated: invoices.length > 500 || snap.size === 3000 }, { status: 200 });
}

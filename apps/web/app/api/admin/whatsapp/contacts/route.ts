import { NextResponse } from 'next/server';
import type { Customer } from '@bro-pics/shared';
import { billingDb, guard } from '../../../../../lib/billing/server';

/**
 * GET ?q=&consent=opted_in|opted_out|unknown — customers with their marketing status, newest first (200 at most).
 * Permission: customers:read. Reads only; consent is changed through ./[id]/consent.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'customers:read');
  if (!g.ok) return g.response;
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const consent = url.searchParams.get('consent');
  const db = billingDb();
  let query: FirebaseFirestore.Query = db.collection('customers');
  if (consent === 'opted_in' || consent === 'opted_out' || consent === 'unknown') query = query.where('consent.marketing.status', '==', consent);
  const snap = await query.orderBy('updatedAt', 'desc').limit(q ? 1000 : 200).get();
  const customers = snap.docs
    .map((d) => d.data() as Customer)
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/\D/g, '') || q) || (c.tags ?? []).includes(q))
    .slice(0, 200)
    .map((c) => ({ id: c.id, name: c.name, phone: c.phone, city: c.city ?? null, state: c.state ?? null, origin: c.origin ?? null, tags: c.tags ?? [], marketing: { status: c.consent.marketing.status, at: c.consent.marketing.at, source: c.consent.marketing.source }, transactional: c.consent.transactional.status, onlineOrders: c.stats.onlineOrders, posPurchases: c.stats.posPurchases }));
  const total = await db.collection('customers').count().get();
  return NextResponse.json({ customers, total: total.data().count }, { status: 200 });
}

import { NextResponse } from 'next/server';
import { customerIdForPhone, normalizeIndianMobile, type Customer } from '@bro-pics/shared';
import { billingDb, guard } from '../../../../../lib/billing/server';

/**
 * GET /api/admin/billing/customers?phone=… — one customer per mobile number:
 * an existing billing customer, else a website account with that number
 * (so an online customer buying in store is the same person), else nothing.
 * Without ?phone: the most recent customers (?q= filters by name/number).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'billing:view');
  if (!g.ok) return g.response;
  const url = new URL(request.url);
  const db = billingDb();
  const raw = url.searchParams.get('phone');
  if (raw !== null) {
    let phone: string;
    try {
      phone = normalizeIndianMobile(raw);
    } catch (err) {
      return NextResponse.json({ error: { code: 'invalid_phone', message: (err as Error).message } }, { status: 400 });
    }
    const snap = await db.collection('customers').doc(customerIdForPhone(phone)).get();
    if (snap.exists) return NextResponse.json({ customer: snap.data() as Customer, account: null }, { status: 200 });
    const users = await db.collection('users').where('phone', '==', phone).limit(1).get();
    const u = users.docs[0]?.data() as { displayName?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null } | undefined;
    return NextResponse.json({ customer: null, phone, account: u ? { name: u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || null, email: u.email ?? null } : null }, { status: 200 });
  }
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const snap = await db.collection('customers').orderBy('updatedAt', 'desc').limit(q ? 500 : 100).get();
  const customers = snap.docs.map((d) => d.data() as Customer).filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/\D/g, '') || q)).slice(0, 100);
  return NextResponse.json({ customers }, { status: 200 });
}

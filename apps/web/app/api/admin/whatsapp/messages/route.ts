import { NextResponse } from 'next/server';
import { maskPhone, type WhatsAppMessage } from '@bro-pics/shared';
import { billingDb, guard } from '../../../../../lib/billing/server';

/**
 * GET /api/admin/whatsapp/messages?category=&status=&q= — every WhatsApp
 * message (OTP, transactional, marketing) with its status, provider id and
 * failure reason, newest first. OTP codes are never stored.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'whatsapp:logs');
  if (!g.ok) return g.response;
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const status = url.searchParams.get('status');
  // Full numbers and names only for staff who may see customer details; everyone else sees the last four digits.
  const full = g.can('customers:read');
  const q = full ? (url.searchParams.get('q') ?? '').trim().replace(/\D/g, '') : '';
  const snap = await billingDb().collection('whatsappMessages').orderBy('createdAt', 'desc').limit(1000).get();
  const messages = snap.docs
    .map((d) => d.data() as WhatsAppMessage)
    .filter((m) => !category || m.category === category)
    .filter((m) => !status || m.status === status)
    .filter((m) => !q || m.to.includes(q))
    .slice(0, 300);
  const customerIds = [...new Set(messages.map((m) => m.customerId).filter((x): x is string => Boolean(x)))].slice(0, 300);
  const names = new Map<string, string>();
  if (customerIds.length) {
    const refs = customerIds.map((id) => billingDb().collection('customers').doc(id));
    for (const s of await billingDb().getAll(...refs)) if (s.exists) names.set(s.id, String(s.get('name')));
  }
  return NextResponse.json({ messages: messages.map((m) => ({ ...m, to: full ? m.to : maskPhone(m.to), customerName: full && m.customerId ? names.get(m.customerId) ?? null : null })) }, { status: 200 });
}

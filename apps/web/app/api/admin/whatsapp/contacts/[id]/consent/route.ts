import { NextResponse } from 'next/server';
import type { Customer } from '@bro-pics/shared';
import { isSuppressed, recordMarketingOptOut } from '@bro-pics/shared/src/whatsapp/consent';
import { billingDb, guard } from '../../../../../../../lib/billing/server';
import { adminApiError } from '../../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../../lib/audit-log';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT { marketing: 'opted_in' | 'opted_out', source, evidence? } — staff recording what a customer told them.
 *  - opted_out: always allowed; adds the number to the suppression list.
 *  - opted_in: needs a source AND evidence (a form number, a signed-sheet reference) and is refused for anyone who has
 *    opted out: only the customer can opt back in (by replying START).
 * Permission: whatsapp:consent_edit (administrators). Never changes order/invoice (transactional) consent.
 */
export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const g = await guard(request, 'whatsapp:consent_edit');
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!/^p\d{8,15}$/.test(id)) return adminApiError(400, 'invalid_request', 'Invalid customer id');
  const body = (await request.json().catch(() => null)) as { marketing?: unknown; source?: unknown; evidence?: unknown } | null;
  const status = body?.marketing;
  const source = typeof body?.source === 'string' ? body.source.trim().slice(0, 80) : '';
  const evidence = typeof body?.evidence === 'string' ? body.evidence.trim().slice(0, 300) : '';
  if (status !== 'opted_in' && status !== 'opted_out') return adminApiError(400, 'invalid_request', 'marketing must be opted_in or opted_out');
  if (!source) return adminApiError(400, 'invalid_request', 'Say where this came from (for example "phone call" or "signed sheet").');

  const db = billingDb();
  const ref = db.collection('customers').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return adminApiError(404, 'not_found', 'Unknown customer');
  const customer = snap.data() as Customer;
  const nowIso = new Date().toISOString();

  if (status === 'opted_out') {
    await recordMarketingOptOut(db, { phone: customer.phone, source: `admin:${source}`, nowIso });
  } else {
    if (!evidence) return adminApiError(400, 'invalid_request', 'Marketing permission needs evidence: a form number or a reference to the signed sheet.');
    if (customer.consent.marketing.status === 'opted_out' || (await isSuppressed(db, id))) {
      return adminApiError(409, 'conflict', 'This person opted out. Only they can opt back in, by replying START to a WhatsApp message.');
    }
    await ref.update({ 'consent.marketing': { status: 'opted_in', at: nowIso, source: `admin:${source}`, evidence }, updatedAt: nowIso });
  }
  await writeAuditLog(db, { actorUid: g.uid, action: 'whatsapp.consent_changed', resource: 'customer', resourceId: id, details: { marketing: status, source } }).catch(() => undefined);
  return NextResponse.json({ ok: true }, { status: 200 });
}

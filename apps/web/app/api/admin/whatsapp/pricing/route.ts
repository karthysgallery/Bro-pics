import { NextResponse } from 'next/server';
import { billingDb, guard } from '../../../../../lib/billing/server';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';

/**
 * The per-message price used for campaign cost ESTIMATES. The code holds no price list (Meta changes rates and they differ by
 * country and category): the owner types the current rate from Meta's pricing page / WhatsApp Manager, with the date, and
 * the estimate shows that date. Permission: whatsapp:templates_manage.
 */
const DOC = 'whatsappConfig';
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'marketing:whatsapp');
  if (!g.ok) return g.response;
  const snap = await billingDb().collection(DOC).doc('pricing').get();
  return NextResponse.json({ pricing: snap.exists ? snap.data() : null }, { status: 200 });
}

export async function PUT(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'whatsapp:templates_manage');
  if (!g.ok) return g.response;
  const body = (await request.json().catch(() => null)) as { marketingPerMessageInr?: unknown; checkedOn?: unknown; source?: unknown } | null;
  const rate = body?.marketingPerMessageInr;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100) return adminApiError(400, 'invalid_request', 'Enter the rate in rupees per message (0 to 100).');
  const checkedOn = typeof body?.checkedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.checkedOn) ? body.checkedOn : null;
  if (!checkedOn) return adminApiError(400, 'invalid_request', 'Enter the date you checked the rate (YYYY-MM-DD).');
  const source = typeof body?.source === 'string' ? body.source.trim().slice(0, 200) : '';
  const pricing = { marketingPerMessageInr: rate, checkedOn, source: source || 'Meta pricing page', updatedBy: g.uid, updatedAt: new Date().toISOString() };
  const db = billingDb();
  await db.collection(DOC).doc('pricing').set(pricing);
  await writeAuditLog(db, { actorUid: g.uid, action: 'whatsapp.pricing_updated', resource: 'whatsappConfig', resourceId: 'pricing', details: { marketingPerMessageInr: rate, checkedOn } }).catch(() => undefined);
  return NextResponse.json({ pricing }, { status: 200 });
}

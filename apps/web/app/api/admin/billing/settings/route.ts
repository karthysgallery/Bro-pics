import { NextResponse } from 'next/server';
import { BillingSettingsSchema, DEFAULT_BILLING_SETTINGS, type BillingSettings } from '@bro-pics/shared';
import { readBillingContext } from '@bro-pics/shared/src/billing/invoice-service';
import { billingDb, guard, whatsappService } from '../../../../../lib/billing/server';
import { writeAuditLog } from '../../../../../lib/audit-log';

/**
 * GET/PUT /api/admin/billing/settings — what invoices say (business details,
 * prefixes, footer), payment methods, the staff discount limit and the
 * WhatsApp invoice switch. GST rate/GSTIN stay in Store & GST settings.
 * Changing a prefix is safe: numbering continues on the same per-year
 * sequence, so no two documents can share a number.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'billing:view');
  if (!g.ok) return g.response;
  const ctx = await readBillingContext(billingDb());
  return NextResponse.json({ settings: ctx.settings, gst: ctx.gst, whatsappMode: whatsappService().mode, canEdit: g.can('billing:settings') }, { status: 200 });
}

export async function PUT(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'billing:settings');
  if (!g.ok) return g.response;
  const parsed = BillingSettingsSchema.safeParse({ ...DEFAULT_BILLING_SETTINGS, ...((await request.json().catch(() => null)) ?? {}) });
  if (!parsed.success) return NextResponse.json({ error: { code: 'invalid_request', message: `${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}` } }, { status: 400 });
  const db = billingDb();
  const before = (await db.collection('settings').doc('billing').get()).data() as BillingSettings | undefined;
  const value: BillingSettings = { ...parsed.data, email: parsed.data.email || undefined } as BillingSettings;
  await db.collection('settings').doc('billing').set(JSON.parse(JSON.stringify(value)));
  await writeAuditLog(db, { actorUid: g.uid, action: 'billing.settings_updated', resource: 'settings', resourceId: 'billing', details: { before: before ?? null, after: value } }).catch(() => undefined);
  return NextResponse.json({ settings: value }, { status: 200 });
}

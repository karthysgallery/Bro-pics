import { NextResponse } from 'next/server';
import type { Invoice } from '@bro-pics/shared';
import { finishInvoice } from '@bro-pics/shared/src/billing/invoice-service';
import { billingDb, finishDeps, guard } from '../../../../../../../lib/billing/server';
import { writeAuditLog } from '../../../../../../../lib/audit-log';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/admin/billing/invoices/[id]/whatsapp — send (or resend) the invoice on WhatsApp. Consent and settings still apply. */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const g = await guard(request, 'billing:send_whatsapp');
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const db = billingDb();
  const invoice = (await db.collection('invoices').doc(id).get()).data() as Invoice | undefined;
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  const done = await finishInvoice(finishDeps(), id, { send: true });
  await writeAuditLog(db, { actorUid: g.uid, action: 'billing.invoice_resent', resource: 'invoice', resourceId: id, details: { invoiceNo: invoice.invoiceNo, whatsapp: done.whatsapp.status, error: done.whatsapp.error } }).catch(() => undefined);
  return NextResponse.json({ whatsapp: done.whatsapp }, { status: done.whatsapp.status === 'failed' ? 502 : 200 });
}

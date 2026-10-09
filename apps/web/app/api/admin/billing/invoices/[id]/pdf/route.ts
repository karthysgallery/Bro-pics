import { NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import type { Invoice } from '@bro-pics/shared';
import { finishInvoice } from '@bro-pics/shared/src/billing/invoice-service';
import { billingDb, finishDeps, guard } from '../../../../../../../lib/billing/server';
import { getAdminApp } from '../../../../../../../lib/firebase-admin';
import { writeAuditLog } from '../../../../../../../lib/audit-log';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/billing/invoices/[id]/pdf — the invoice PDF, streamed from
 * this site (no public link). If it was never stored (or ?regenerate=1), it
 * is made again from the saved invoice — same content, recorded in the audit log.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const g = await guard(request, 'billing:download');
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const db = billingDb();
  const ref = db.collection('invoices').doc(id);
  let invoice = (await ref.get()).data() as Invoice | undefined;
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  const regenerate = new URL(request.url).searchParams.get('regenerate') === '1';
  if (!invoice.pdfPath || regenerate) {
    const done = await finishInvoice(finishDeps(), id, { send: false });
    if (!done.pdfPath) return NextResponse.json({ error: `The PDF could not be made: ${done.pdfError}` }, { status: 500 });
    await writeAuditLog(db, { actorUid: g.uid, action: 'billing.invoice_regenerated', resource: 'invoice', resourceId: id, details: { invoiceNo: invoice.invoiceNo } }).catch(() => undefined);
    invoice = (await ref.get()).data() as Invoice;
  }
  const [bytes] = await getStorage(getAdminApp()).bucket().file(invoice.pdfPath!).download();
  const disposition = new URL(request.url).searchParams.get('download') === '1' ? 'attachment' : 'inline';
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${disposition}; filename="${invoice.invoiceNo}.pdf"`, 'Cache-Control': 'private, no-store' },
  });
}

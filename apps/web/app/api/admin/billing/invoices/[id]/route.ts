import { NextResponse } from 'next/server';
import type { Invoice, PosSale, WhatsAppMessage } from '@bro-pics/shared';
import { billingDb, guard } from '../../../../../../lib/billing/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/admin/billing/invoices/[id] — the invoice, its sale and returns (in store), credit notes, and WhatsApp messages. */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const g = await guard(request, 'billing:view');
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const db = billingDb();
  const snap = await db.collection('invoices').doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  const invoice = snap.data() as Invoice;
  const [sale, returns, creditNotes, messages] = await Promise.all([
    invoice.saleId ? db.collection('posSales').doc(invoice.saleId).get() : null,
    invoice.saleId ? db.collection('posSales').doc(invoice.saleId).collection('returns').get() : null,
    invoice.kind === 'invoice' ? db.collection('invoices').where('originalInvoiceId', '==', invoice.id).get() : null,
    db.collection('whatsappMessages').where('related.id', '==', invoice.id).get(),
  ]);
  return NextResponse.json(
    {
      invoice,
      sale: sale?.exists ? (sale.data() as PosSale) : null,
      returns: returns?.docs.map((d) => d.data()) ?? [],
      creditNotes: creditNotes?.docs.map((d) => d.data() as Invoice) ?? [],
      messages: messages.docs.map((d) => d.data() as WhatsAppMessage).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      can: { download: g.can('billing:download'), sendWhatsApp: g.can('billing:send_whatsapp'), refund: g.can('billing:refund') },
    },
    { status: 200 }
  );
}

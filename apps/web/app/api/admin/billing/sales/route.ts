import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PaymentMethodSchema, ConsentStatusSchema, type Invoice, type PosSale } from '@bro-pics/shared';
import { createPosSale, finishInvoice } from '@bro-pics/shared/src/billing/invoice-service';
import { billingDb, billingErrorResponse, finishDeps, guard } from '../../../../../lib/billing/server';
import { writeAuditLog } from '../../../../../lib/audit-log';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const BodySchema = z
  .object({
    clientRequestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
    customer: z.object({ phone: z.string().min(10).max(20), name: z.string().trim().min(1).max(120), email: z.string().email().max(120).optional().or(z.literal('')) }),
    lines: z
      .array(
        z
          .object({ productId: id, variantId: id, qty: z.number().int().min(1).max(999), discountPercent: z.number().min(0).max(100).optional(), discountAmount: z.number().int().min(0).optional() })
          .strict()
      )
      .min(1)
      .max(100),
    payments: z.array(z.object({ method: PaymentMethodSchema, amount: z.number().int().min(0), reference: z.string().max(80).optional() }).strict()).min(1).max(4),
    /** Send the invoice on WhatsApp now (staff asked the customer). */
    sendWhatsApp: z.boolean(),
    consent: z.object({ transactional: ConsentStatusSchema.nullable(), marketing: ConsentStatusSchema.nullable() }),
  })
  .strict();

/**
 * POST /api/admin/billing/sales — complete an in-store bill.
 * Prices, discounts, tax and totals are recalculated on the server from the
 * catalogue; the till only says what and how many. Stock, invoice number,
 * customer and sale are written in one transaction (nothing is half-done),
 * then the PDF is stored and, when asked, sent on WhatsApp.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'billing:create');
  if (!g.ok) return g.response;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'invalid_request', message: parsed.error.issues[0]?.message ?? 'Invalid bill' } }, { status: 400 });
  const body = parsed.data;
  if (body.sendWhatsApp && !g.can('billing:send_whatsapp')) return NextResponse.json({ error: { code: 'forbidden', message: 'You cannot send invoices on WhatsApp' } }, { status: 403 });

  const db = billingDb();
  let result;
  try {
    result = await createPosSale(db, {
      staffUid: g.uid,
      canOverrideDiscount: g.can('billing:discount_override'),
      clientRequestId: body.clientRequestId,
      customer: { phone: body.customer.phone, name: body.customer.name, email: body.customer.email || null },
      lines: body.lines,
      payments: body.payments,
      consent: body.consent,
    });
  } catch (err) {
    return billingErrorResponse(err);
  }

  if (result.created) {
    const audit = (action: string, details: Record<string, unknown>) => writeAuditLog(db, { actorUid: g.uid, action, resource: 'invoice', resourceId: result.invoiceId, details }).catch(() => undefined);
    await audit('billing.bill_created', { invoiceNo: result.invoiceNo, saleId: result.saleId, total: result.total, payments: body.payments.map((p) => p.method) });
    if (result.discount > 0) await audit('billing.discount_applied', { invoiceNo: result.invoiceNo, discount: result.discount });
  }
  const finish = await finishInvoice(finishDeps(), result.invoiceId, { send: result.created && body.sendWhatsApp });
  if (finish.whatsapp.status === 'sent') {
    await writeAuditLog(db, { actorUid: g.uid, action: 'billing.whatsapp_sent', resource: 'invoice', resourceId: result.invoiceId, details: { invoiceNo: result.invoiceNo } }).catch(() => undefined);
  }
  return NextResponse.json({ ...result, pdf: finish.pdfPath ? 'ready' : 'failed', pdfError: finish.pdfError ?? null, whatsapp: finish.whatsapp }, { status: result.created ? 201 : 200 });
}

/** GET /api/admin/billing/sales?from=&to= — in-store sales for the sales dashboard. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'billing:view');
  if (!g.ok) return g.response;
  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? new Date(Date.now() - 86_400_000).toISOString();
  const to = url.searchParams.get('to') ?? new Date().toISOString();
  const snap = await billingDb().collection('posSales').where('createdAt', '>=', from).where('createdAt', '<=', to).orderBy('createdAt', 'desc').limit(1000).get();
  return NextResponse.json({ sales: snap.docs.map((d) => d.data() as PosSale) }, { status: 200 });
}

export type { Invoice };

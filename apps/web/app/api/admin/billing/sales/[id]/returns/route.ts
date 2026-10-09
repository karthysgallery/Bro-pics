import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PaymentMethodSchema } from '@bro-pics/shared';
import { createPosReturn, finishInvoice } from '@bro-pics/shared/src/billing/invoice-service';
import { billingDb, billingErrorResponse, finishDeps, guard } from '../../../../../../../lib/billing/server';
import { writeAuditLog } from '../../../../../../../lib/audit-log';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const BodySchema = z
  .object({
    clientRequestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
    items: z.array(z.object({ lineIndex: z.number().int().min(0).max(99), qty: z.number().int().min(1).max(999) }).strict()).min(1).max(100),
    refundMethod: PaymentMethodSchema,
    reference: z.string().max(80).optional(),
    reason: z.string().trim().min(1, 'Say why it is being returned').max(200),
    restock: z.boolean(),
  })
  .strict();

/**
 * POST /api/admin/billing/sales/[id]/returns — a full or partial in-store
 * return: a numbered credit note, stock back (unless damaged), the bill's
 * refunded amount and status updated. Refund permission only.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const g = await guard(request, 'billing:refund');
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'invalid_request', message: parsed.error.issues[0]?.message ?? 'Invalid return' } }, { status: 400 });
  const db = billingDb();
  try {
    const result = await createPosReturn(db, { saleId: id, staffUid: g.uid, ...parsed.data, reference: parsed.data.reference ?? null });
    if (result.created) {
      await writeAuditLog(db, { actorUid: g.uid, action: 'billing.refund_created', resource: 'pos_sale', resourceId: id, details: { creditNoteNo: result.creditNoteNo, amount: result.amount, items: parsed.data.items, restock: parsed.data.restock, reason: parsed.data.reason } }).catch(() => undefined);
    }
    const finish = await finishInvoice(finishDeps(), result.creditNoteId, { send: false });
    return NextResponse.json({ ...result, pdf: finish.pdfPath ? 'ready' : 'failed' }, { status: result.created ? 201 : 200 });
  } catch (err) {
    return billingErrorResponse(err);
  }
}

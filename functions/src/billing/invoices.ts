import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { createOnlineInvoice, finishInvoice, recordOnlineRefund, type FinishDeps } from '@bro-pics/shared/src/billing/invoice-service';
import { createWhatsAppService, transportFromEnv } from '@bro-pics/shared/src/whatsapp/service';
import { dueCampaigns, sendCampaignBatch, startCampaign } from '@bro-pics/shared/src/whatsapp/campaigns';

/**
 * Online orders get their invoice automatically — no staff action. When the
 * payment transaction has assigned the invoice number (status paid), this
 * creates the invoice from the order, stores the PDF and sends it on
 * WhatsApp. Retries are safe: the invoice id is fixed per order and created
 * once (see createOnlineInvoice), and the PDF/WhatsApp step only runs for the
 * call that created it.
 */

function deps(): FinishDeps {
  const db = getFirestore();
  return { db, bucket: getStorage().bucket(), whatsapp: createWhatsAppService({ db, transport: transportFromEnv() }) };
}

type OrderFields = { invoiceNo?: string; paymentStatus?: string } | undefined;

export function needsInvoice(before: OrderFields, after: OrderFields): boolean {
  return Boolean(after?.invoiceNo) && after?.paymentStatus === 'paid' && !(before?.invoiceNo && before?.paymentStatus === 'paid');
}

export const invoiceOnPayment = onDocumentWritten({ document: 'orders/{orderId}', region: 'asia-south1', retry: true }, async (event) => {
  const before = event.data?.before.data() as OrderFields;
  const after = event.data?.after.data() as OrderFields;
  if (!needsInvoice(before, after)) return;
  const orderId = event.params.orderId;
  const result = await createOnlineInvoice(getFirestore(), orderId);
  if (!result) {
    logger.warn('Online invoice not created (order missing, unpaid or without a number)', { orderId });
    return;
  }
  if (!result.created) return;
  const done = await finishInvoice(deps(), result.invoiceId, { send: true });
  logger.info('Online invoice issued', { orderId, invoiceId: result.invoiceId, pdf: Boolean(done.pdfPath), whatsapp: done.whatsapp.status, error: done.whatsapp.error ?? done.pdfError ?? null });
});

type RefundFields = { status?: string; amount?: number; reason?: string | null; razorpayRefundId?: string | null } | undefined;

/** A processed online refund → credit note against the order's invoice (once per refund). */
export const creditNoteOnRefund = onDocumentWritten({ document: 'orders/{orderId}/refunds/{refundId}', region: 'asia-south1', retry: true }, async (event) => {
  const after = event.data?.after.data() as RefundFields;
  const before = event.data?.before.data() as RefundFields;
  if (after?.status !== 'processed' || before?.status === 'processed' || !after.amount) return;
  const result = await recordOnlineRefund(getFirestore(), {
    orderId: event.params.orderId,
    refundId: event.params.refundId,
    amount: after.amount,
    reason: after.reason ?? null,
    reference: after.razorpayRefundId ?? null,
  });
  if (result?.created) await finishInvoice(deps(), result.creditNoteId, { send: false });
});

/** Starts scheduled campaigns when due and keeps sending large ones in batches. */
export const sendWhatsAppCampaigns = onSchedule({ schedule: 'every 5 minutes', region: 'asia-south1', timeZone: 'Asia/Kolkata', timeoutSeconds: 540 }, async () => {
  const db = getFirestore();
  const { whatsapp } = deps();
  const { toStart, sending } = await dueCampaigns(db);
  for (const id of toStart) await startCampaign(db, id);
  for (const id of [...new Set([...toStart, ...sending])]) {
    const r = await sendCampaignBatch(db, whatsapp!, id, 500);
    logger.info('WhatsApp campaign batch', { campaignId: id, ...r });
  }
});

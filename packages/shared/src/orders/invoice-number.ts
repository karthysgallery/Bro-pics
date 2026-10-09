import type { CounterDocRef, CounterTransaction } from './order-number';
import { financialYearOf, formatInvoiceNo, invoiceCounterPath, creditNoteCounterPath } from '../billing/invoice-engine';

// [BE-22] Sequential, gap-free invoice numbering — assigned only once a sale
// is real: an online order's payment confirmation (razorpayWebhook / mock
// payment) or a completed in-store bill. ONE sequence for both channels, per
// Indian financial year (GST requires a unique serial per FY), e.g.
// KG-INV-2026-000001. The prefix comes from Admin → Billing settings; the
// sequence is independent of the prefix, so changing the prefix can never
// produce a duplicate. Callers also create invoiceNumbers/{no} in the same
// transaction as a hard uniqueness lock.

export const DEFAULT_INVOICE_PREFIX = 'KG-INV';
export const DEFAULT_CREDIT_NOTE_PREFIX = 'KG-CN';

export async function generateInvoiceNo(
  tx: CounterTransaction,
  when: Date,
  prefix: string = DEFAULT_INVOICE_PREFIX,
  kind: 'invoice' | 'credit_note' = 'invoice'
): Promise<string> {
  const fy = financialYearOf(when);
  const ref: CounterDocRef = { path: kind === 'invoice' ? invoiceCounterPath(fy) : creditNoteCounterPath(fy) };
  const snapshot = await tx.get(ref);
  const next = (snapshot.exists ? snapshot.data()!.value : 0) + 1;
  tx.set(ref, { value: next });
  return formatInvoiceNo(prefix, fy, next);
}

import type { CounterDocRef, CounterTransaction } from './order-number';

// [BE-22] Sequential, gap-free invoice numbering — assigned only once an
// order's payment is actually confirmed (see razorpayWebhook's
// payment_confirmed step), never at order creation, so an abandoned
// pending_payment order never consumes an invoice number it doesn't need.
// Same counters/{key} pattern as generateOrderNo, a separate counter doc
// so invoice and order sequences advance independently.
const COUNTER_REF: CounterDocRef = { path: 'counters/invoiceSeq' };

export async function generateInvoiceNo(tx: CounterTransaction, year: number): Promise<string> {
  const snapshot = await tx.get(COUNTER_REF);
  const currentValue = snapshot.exists ? snapshot.data()!.value : 0;
  const nextValue = currentValue + 1;
  tx.set(COUNTER_REF, { value: nextValue });
  const padded = String(nextValue).padStart(5, '0');
  return `INV-${year}-${padded}`;
}

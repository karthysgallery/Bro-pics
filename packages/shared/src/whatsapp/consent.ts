import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { customerIdForPhone } from '../billing/invoice-engine';
import type { Customer } from '../schemas/billing';

/**
 * The ONE place that decides who may be sent what.
 *
 *  - Transactional (order and invoice messages): allowed unless the customer opted out of them.
 *  - Marketing (offers, campaigns): allowed only with a recorded opt-in, and never to an opted-out or suppressed number.
 *
 * Consent for one is never consent for the other. Server-only (firebase-admin) for the suppression helpers; the two
 * `*Eligibility` functions are pure.
 */

export type MarketingBlock = 'not_opted_in' | 'opted_out' | 'suppressed' | 'invalid_phone';

export function marketingEligibility(c: Pick<Customer, 'phone' | 'consent'>, opts: { suppressed: boolean }): { eligible: true } | { eligible: false; reason: MarketingBlock } {
  if (!/^\+\d{8,15}$/.test(c.phone)) return { eligible: false, reason: 'invalid_phone' };
  if (c.consent.marketing.status === 'opted_out') return { eligible: false, reason: 'opted_out' };
  if (opts.suppressed) return { eligible: false, reason: 'suppressed' };
  if (c.consent.marketing.status !== 'opted_in') return { eligible: false, reason: 'not_opted_in' };
  return { eligible: true };
}

export function transactionalEligibility(c: Pick<Customer, 'phone' | 'consent'> | null): boolean {
  if (!c) return true;
  return /^\+\d{8,15}$/.test(c.phone) && c.consent.transactional.status !== 'opted_out';
}

export const SUPPRESSIONS = 'whatsappSuppressions';

/** Every suppressed customer id (a short list: only people who opted out). */
export async function loadSuppressedIds(db: Firestore): Promise<Set<string>> {
  const snap = await db.collection(SUPPRESSIONS).select().get();
  return new Set(snap.docs.map((d) => d.id));
}

export async function isSuppressed(db: Firestore, customerId: string): Promise<boolean> {
  return (await db.collection(SUPPRESSIONS).doc(customerId).get()).exists;
}

/**
 * An opt-out, from any source (a STOP reply, staff recording a phone call, an import). Updates the customer and adds the
 * number to the suppression list in one batch, so no later import or edit can quietly bring it back.
 */
export async function recordMarketingOptOut(db: Firestore, input: { phone: string; source: string; nowIso: string; createWithName?: string }): Promise<void> {
  const id = customerIdForPhone(input.phone);
  const ref = db.collection('customers').doc(id);
  const snap = await ref.get();
  const marketing = { status: 'opted_out' as const, at: input.nowIso, source: input.source };
  const batch = db.batch();
  if (snap.exists) batch.update(ref, { 'consent.marketing': marketing, updatedAt: input.nowIso });
  else {
    batch.set(ref, {
      id,
      phone: input.phone,
      name: input.createWithName ?? 'WhatsApp contact',
      email: null,
      userId: null,
      source: 'admin',
      stats: { onlineOrders: 0, posPurchases: 0, totalSpent: 0, lastPurchaseAt: null },
      consent: { transactional: { status: 'unknown', at: null, source: null }, marketing },
      createdAt: input.nowIso,
      updatedAt: input.nowIso,
    });
  }
  batch.set(db.collection(SUPPRESSIONS).doc(id), { customerId: id, source: input.source, at: input.nowIso, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
}

/**
 * An opt-in the customer made themselves (for example replying START). The reply itself is the evidence. Lifts the
 * suppression, because the person who asked to stop is the person asking to start again.
 */
export async function recordCustomerOptIn(db: Firestore, input: { phone: string; source: string; evidence: string; nowIso: string }): Promise<void> {
  const id = customerIdForPhone(input.phone);
  const ref = db.collection('customers').doc(id);
  const snap = await ref.get();
  const marketing = { status: 'opted_in' as const, at: input.nowIso, source: input.source, evidence: input.evidence };
  const batch = db.batch();
  if (snap.exists) batch.update(ref, { 'consent.marketing': marketing, updatedAt: input.nowIso });
  else {
    batch.set(ref, {
      id,
      phone: input.phone,
      name: 'WhatsApp contact',
      email: null,
      userId: null,
      source: 'admin',
      stats: { onlineOrders: 0, posPurchases: 0, totalSpent: 0, lastPurchaseAt: null },
      consent: { transactional: { status: 'unknown', at: null, source: null }, marketing },
      createdAt: input.nowIso,
      updatedAt: input.nowIso,
    });
  }
  batch.delete(db.collection(SUPPRESSIONS).doc(id));
  await batch.commit();
}

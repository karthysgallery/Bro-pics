import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { buildPurchaseEvent, capiSkipReason, sendCapiEvents, type CapiItem, type CapiOrder } from '@bro-pics/shared/src/marketing/meta-capi';

/**
 * Meta Conversions API: one server-side Purchase per paid order.
 *
 * Fail-closed. Nothing is sent unless the owner switched Meta tracking on with a Pixel ID (settings/marketing), the
 * access token is in Secret Manager (`META_CAPI_TOKEN`, any value shorter than 20 characters counts as "not set"),
 * the payment is verified (paymentStatus 'paid' — set only by the server's payment pipeline, never by a browser),
 * and the customer allowed ad measurement. Each order has one record at metaEvents/purchase_<orderId>, so retries
 * and repeated triggers never send it twice; failures are retried by `metaPurchaseRetry` (up to 5 attempts, within
 * Meta's 7-day window).
 */
export const metaCapiToken = defineSecret('META_CAPI_TOKEN');

const SITE_URL = 'https://karthysgallery.in';
const MAX_ATTEMPTS = 5;

type OrderFields = { paymentStatus?: string } | undefined;

export function becamePaid(before: OrderFields, after: OrderFields): boolean {
  return after?.paymentStatus === 'paid' && before?.paymentStatus !== 'paid';
}

export interface MetaPurchaseDeps {
  db: Firestore;
  token: string;
  send?: typeof sendCapiEvents;
  nowS?: number;
}

export type MetaPurchaseOutcome = 'sent' | 'skipped' | 'failed' | 'disabled' | 'already_done';

export async function processMetaPurchase(deps: MetaPurchaseDeps, orderId: string, firstSeenS: number): Promise<MetaPurchaseOutcome> {
  const { db } = deps;
  const nowS = deps.nowS ?? Math.floor(Date.now() / 1000);
  const settings = (await db.collection('settings').doc('marketing').get()).data() as { metaEnabled?: boolean; metaPixelId?: string; metaTestEventCode?: string } | undefined;
  const pixelId = settings?.metaPixelId ?? '';
  if (!settings?.metaEnabled || !/^\d{10,20}$/.test(pixelId) || deps.token.trim().length < 20) return 'disabled';

  const ref = db.collection('metaEvents').doc(`purchase_${orderId}`);
  // Claim the send: only one run at a time, and never after it was sent or given up.
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data() as { status?: string; attempts?: number; eventTimeS?: number; updatedAt?: { toDate(): Date } | Date } | undefined;
    const touched = cur?.updatedAt ? (cur.updatedAt instanceof Date ? cur.updatedAt : cur.updatedAt.toDate()) : null;
    // A run that died mid-send (crash, timeout) is taken over after 10 minutes.
    const stuck = cur?.status === 'sending' && touched !== null && Date.now() - touched.getTime() > 10 * 60_000;
    if (cur && (cur.status === 'sent' || cur.status === 'skipped' || (cur.status === 'sending' && !stuck) || (cur.attempts ?? 0) >= MAX_ATTEMPTS)) return null;
    const attempts = (cur?.attempts ?? 0) + 1;
    const eventTimeS = cur?.eventTimeS ?? firstSeenS;
    tx.set(ref, { orderId, status: 'sending', attempts, eventTimeS, updatedAt: new Date(), ...(cur ? {} : { createdAt: new Date() }) }, { merge: true });
    return { attempts, eventTimeS };
  });
  if (!claim) return 'already_done';

  try {
    const orderSnap = await db.collection('orders').doc(orderId).get();
    const order = { id: orderId, ...(orderSnap.data() ?? {}) } as CapiOrder;
    const items = (await db.collection('orders').doc(orderId).collection('items').get()).docs.map((d) => d.data() as CapiItem);
    const email = order.userId ? ((await db.collection('users').doc(order.userId).get()).get('email') as string | null | undefined) : null;
    const input = { order, items, email, eventTimeS: claim.eventTimeS, siteUrl: SITE_URL };
    const skip = capiSkipReason(input, nowS);
    if (skip) {
      await ref.set({ status: 'skipped', reason: skip, updatedAt: new Date() }, { merge: true });
      return 'skipped';
    }
    const reply = await (deps.send ?? sendCapiEvents)({ pixelId, accessToken: deps.token, events: [buildPurchaseEvent(input)], testEventCode: settings.metaTestEventCode || undefined });
    await ref.set({ status: 'sent', sentAt: new Date(), eventsReceived: reply.events_received ?? null, fbtraceId: reply.fbtrace_id ?? null, test: Boolean(settings.metaTestEventCode), updatedAt: new Date() }, { merge: true });
    return 'sent';
  } catch (err) {
    const last = claim.attempts >= MAX_ATTEMPTS;
    await ref.set(
      { status: last ? 'failed_permanent' : 'failed', lastError: String(err).slice(0, 500), nextAttemptAt: new Date(Date.now() + 30 * 60_000 * claim.attempts), updatedAt: new Date() },
      { merge: true }
    );
    return 'failed';
  }
}

export const metaPurchaseOnPaid = onDocumentWritten({ document: 'orders/{orderId}', region: 'asia-south1', retry: false, secrets: [metaCapiToken] }, async (event) => {
  const before = event.data?.before.data() as OrderFields;
  const after = event.data?.after.data() as OrderFields;
  if (!becamePaid(before, after)) return;
  const firstSeenS = Math.floor(new Date(event.time).getTime() / 1000) || Math.floor(Date.now() / 1000);
  const outcome = await processMetaPurchase({ db: getFirestore(), token: metaCapiToken.value() ?? '' }, event.params.orderId, firstSeenS);
  if (outcome !== 'disabled') logger.info('Meta purchase event', { orderId: event.params.orderId, outcome });
});

/** Retries failed sends (Meta down, token problem) every 30 minutes. */
export const metaPurchaseRetry = onSchedule({ schedule: 'every 30 minutes', region: 'asia-south1', timeZone: 'Asia/Kolkata', secrets: [metaCapiToken] }, async () => {
  const db = getFirestore();
  const [due, stuck] = await Promise.all([
    db.collection('metaEvents').where('status', '==', 'failed').where('nextAttemptAt', '<=', new Date()).limit(50).get(),
    db.collection('metaEvents').where('status', '==', 'sending').where('updatedAt', '<=', new Date(Date.now() - 10 * 60_000)).limit(50).get(),
  ]);
  for (const d of [...due.docs, ...stuck.docs]) {
    const { orderId, eventTimeS } = d.data() as { orderId: string; eventTimeS: number };
    const outcome = await processMetaPurchase({ db, token: metaCapiToken.value() ?? '' }, orderId, eventTimeS);
    logger.info('Meta purchase retry', { orderId, outcome });
  }
});

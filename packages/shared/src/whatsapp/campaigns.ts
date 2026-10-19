import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { Campaign, CampaignAudience, Customer, Invoice } from '../schemas/billing';
import type { WhatsAppService } from './service';
import { isSuppressed, loadSuppressedIds, marketingEligibility } from './consent';
import { marketingTemplateProblem } from './template-registry';

/**
 * WhatsApp marketing campaigns — separate from billing and OTP. Only
 * customers with a recorded marketing opt-in are ever chosen, and consent is
 * re-checked at the moment each message is sent, so an opt-out (a STOP
 * reply, or staff recording it) takes effect immediately, even mid-campaign.
 * Server-only — import by path.
 */

/** Who the audience rule picks, among customers who opted in to marketing. */
export function matchesAudience(c: Customer, audience: CampaignAudience, ctx: { now: Date; categoryBuyers?: Set<string>; suppressed?: Set<string> }): boolean {
  if (!marketingEligibility(c, { suppressed: ctx.suppressed?.has(c.id) ?? false }).eligible) return false;
  const purchases = c.stats.onlineOrders + c.stats.posPurchases;
  const last = c.stats.lastPurchaseAt ? new Date(c.stats.lastPurchaseAt).getTime() : null;
  const daysAgo = (d: number) => ctx.now.getTime() - d * 86_400_000;
  switch (audience.type) {
    case 'all_opted_in':
      return true;
    case 'previous_customers':
      return purchases > 0;
    case 'purchased_category':
      return ctx.categoryBuyers?.has(c.id) ?? false;
    case 'purchased_within_days':
      return last !== null && last >= daysAgo(audience.days);
    case 'high_value':
      return c.stats.totalSpent >= audience.minSpent;
    case 'lapsed':
      return purchases > 0 && last !== null && last < daysAgo(audience.days);
    case 'origin':
      return c.origin === audience.origin;
    case 'tag':
      return (c.tags ?? []).includes(audience.tag);
  }
}

/** Customers who bought from a category (from their invoices). */
async function categoryBuyers(db: Firestore, categoryId: string): Promise<Set<string>> {
  const products = await db.collection('products').where('categoryId', '==', categoryId).select().get();
  const ids = new Set(products.docs.map((d) => d.id));
  const invoices = await db.collection('invoices').where('kind', '==', 'invoice').limit(20000).get();
  const buyers = new Set<string>();
  for (const d of invoices.docs) {
    const inv = d.data() as Invoice;
    if (inv.customerId && inv.status !== 'cancelled' && inv.lines.some((l) => ids.has(l.productId))) buyers.add(inv.customerId);
  }
  return buyers;
}

export async function selectAudience(db: Firestore, audience: CampaignAudience, now = new Date()): Promise<{ recipients: Customer[]; optedOut: number; exclusions: { notOptedIn: number; optedOut: number; suppressed: number; outsideAudience: number } }> {
  const [optedIn, optedOut, everyone, suppressed] = await Promise.all([
    db.collection('customers').where('consent.marketing.status', '==', 'opted_in').get(),
    db.collection('customers').where('consent.marketing.status', '==', 'opted_out').count().get(),
    db.collection('customers').count().get(),
    loadSuppressedIds(db),
  ]);
  const buyers = audience.type === 'purchased_category' ? await categoryBuyers(db, audience.categoryId) : undefined;
  const candidates = optedIn.docs.map((d) => d.data() as Customer);
  const recipients = candidates.filter((c) => matchesAudience(c, audience, { now, categoryBuyers: buyers, suppressed }));
  const suppressedHits = candidates.filter((c) => suppressed.has(c.id)).length;
  const exclusions = {
    notOptedIn: Math.max(0, everyone.data().count - candidates.length - optedOut.data().count),
    optedOut: optedOut.data().count,
    suppressed: suppressedHits,
    outsideAudience: Math.max(0, candidates.length - suppressedHits - recipients.length),
  };
  return { recipients, optedOut: optedOut.data().count, exclusions };
}

/**
 * Starts a campaign: freezes its recipient list (opted-in customers matching
 * the audience right now). Idempotent: an already-started campaign is left
 * as it is.
 */
export async function startCampaign(db: Firestore, campaignId: string, now = new Date()): Promise<number> {
  const ref = db.collection('whatsappCampaigns').doc(campaignId);
  const campaign = (await ref.get()).data() as Campaign | undefined;
  if (!campaign || !['draft', 'scheduled'].includes(campaign.status)) return 0;
  const { recipients, optedOut } = await selectAudience(db, campaign.audience, now);
  for (let i = 0; i < recipients.length; i += 400) {
    const batch = db.batch();
    for (const c of recipients.slice(i, i + 400)) batch.set(ref.collection('recipients').doc(c.id), { customerId: c.id, phone: c.phone, status: 'pending', updatedAt: now.toISOString() });
    await batch.commit();
  }
  await ref.update({ status: 'sending', 'counts.targeted': recipients.length, 'counts.optedOut': optedOut, updatedAt: now.toISOString() });
  return recipients.length;
}

/**
 * Sends up to `limit` pending messages of a campaign; called right after
 * starting, and again by the scheduled sender until none are left. Each
 * recipient's consent is re-read just before sending.
 */
export async function sendCampaignBatch(db: Firestore, wa: WhatsAppService, campaignId: string, limit = 200): Promise<{ sent: number; skipped: number; failed: number; done: boolean; blocked?: 'whatsapp_disabled' | 'template_not_approved' }> {
  const ref = db.collection('whatsappCampaigns').doc(campaignId);
  const campaign = (await ref.get()).data() as Campaign | undefined;
  if (!campaign || campaign.status !== 'sending') return { sent: 0, skipped: 0, failed: 0, done: true };
  // WhatsApp switched off (WHATSAPP_MODE=disabled) or not connected: leave every recipient pending instead of failing them all.
  if (wa.mode === 'disabled') return { sent: 0, skipped: 0, failed: 0, done: false, blocked: 'whatsapp_disabled' };
  // Only a template an administrator has recorded as approved MARKETING may be used; otherwise everyone stays pending.
  if (await marketingTemplateProblem(db, campaign.template, campaign.language)) return { sent: 0, skipped: 0, failed: 0, done: false, blocked: 'template_not_approved' };
  const pending = await ref.collection('recipients').where('status', '==', 'pending').limit(limit).get();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of pending.docs) {
    const customer = (await db.collection('customers').doc(r.id).get()).data() as Customer | undefined;
    const at = new Date().toISOString();
    if (!customer || !marketingEligibility(customer, { suppressed: await isSuppressed(db, customer.id) }).eligible) {
      await r.ref.update({ status: 'skipped_opted_out', updatedAt: at });
      skipped++;
      continue;
    }
    // Claim the recipient first: if this worker dies mid-send, the next run will not send to them a second time.
    const claimed = await db.runTransaction(async (tx) => {
      const cur = await tx.get(r.ref);
      if (cur.get('status') !== 'pending') return false;
      tx.update(r.ref, { status: 'sending', updatedAt: at });
      return true;
    });
    if (!claimed) continue;
    const outcome = await wa.sendMarketingMessage({ customer, campaignId, template: campaign.template, bodyParams: campaign.bodyParams });
    if (outcome.status === 'sent') {
      await r.ref.update({ status: 'sent', messageId: outcome.messageId, updatedAt: at });
      sent++;
    } else if (outcome.status === 'skipped') {
      await r.ref.update({ status: 'skipped_opted_out', updatedAt: at });
      skipped++;
    } else {
      await r.ref.update({ status: 'failed', error: outcome.error, updatedAt: at });
      failed++;
    }
  }
  const done = pending.size < limit;
  const now = new Date().toISOString();
  await ref.update({
    'counts.sent': FieldValue.increment(sent),
    'counts.failed': FieldValue.increment(failed),
    'counts.optedOut': FieldValue.increment(skipped),
    updatedAt: now,
    ...(done && { status: 'sent', sentAt: now }),
  });
  return { sent, skipped, failed, done };
}

/** Scheduled campaigns whose time has come, and campaigns still sending. */
export async function dueCampaigns(db: Firestore, now = new Date()): Promise<{ toStart: string[]; sending: string[] }> {
  const [scheduled, sending] = await Promise.all([
    db.collection('whatsappCampaigns').where('status', '==', 'scheduled').get(),
    db.collection('whatsappCampaigns').where('status', '==', 'sending').get(),
  ]);
  return {
    toStart: scheduled.docs.filter((d) => {
      const at = d.get('scheduledAt') as string | null;
      return at !== null && at <= now.toISOString();
    }).map((d) => d.id),
    sending: sending.docs.map((d) => d.id),
  };
}


/**
 * Puts the failed recipients of a campaign back to pending so the next batch tries them once more (the same claim
 * step prevents a double send). Returns how many were re-queued.
 */
export async function requeueFailedRecipients(db: Firestore, campaignId: string): Promise<number> {
  const ref = db.collection('whatsappCampaigns').doc(campaignId);
  const campaign = (await ref.get()).data() as Campaign | undefined;
  if (!campaign || !['sending', 'sent', 'paused'].includes(campaign.status)) return 0;
  const failed = await ref.collection('recipients').where('status', '==', 'failed').limit(500).get();
  if (failed.empty) return 0;
  const at = new Date().toISOString();
  const batch = db.batch();
  for (const d of failed.docs) batch.update(d.ref, { status: 'pending', error: FieldValue.delete(), updatedAt: at });
  batch.update(ref, { 'counts.failed': FieldValue.increment(-failed.size), status: campaign.status === 'paused' ? 'paused' : 'sending', updatedAt: at });
  await batch.commit();
  return failed.size;
}

/** Cancelling stops every message not yet sent: pending recipients are marked cancelled. */
export async function cancelCampaignRecipients(db: Firestore, campaignId: string): Promise<number> {
  const ref = db.collection('whatsappCampaigns').doc(campaignId);
  const pending = await ref.collection('recipients').where('status', '==', 'pending').get();
  const at = new Date().toISOString();
  for (let i = 0; i < pending.docs.length; i += 400) {
    const batch = db.batch();
    for (const d of pending.docs.slice(i, i + 400)) batch.update(d.ref, { status: 'cancelled', updatedAt: at });
    await batch.commit();
  }
  return pending.size;
}

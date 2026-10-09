import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { BudgetNotificationSchema, budgetSnapshotFromNotification, type BudgetSnapshot } from '@bro-pics/shared';

/**
 * Google Cloud budget alerts → the admin "Running costs" page.
 *
 * A budget on the billing account (scoped to this project) publishes the
 * month-to-date spend to the Pub/Sub topic `billing-budget-alerts` a few
 * times a day. This keeps the latest figure in `ops/runningCosts`, and each
 * month's last figure in `ops/runningCosts/months/{YYYY-MM}` for history.
 */

export interface BudgetAlertDeps {
  save(latest: BudgetSnapshot): Promise<void>;
  now(): Date;
}

/** Returns what was stored, or null for a message that is not a budget alert. */
export async function handleBudgetMessage(json: unknown, deps: BudgetAlertDeps): Promise<BudgetSnapshot | null> {
  const parsed = BudgetNotificationSchema.safeParse(json);
  if (!parsed.success) {
    logger.warn('Ignoring a message that is not a budget alert', { issue: parsed.error.issues[0]?.message });
    return null;
  }
  const snapshot = budgetSnapshotFromNotification(parsed.data, deps.now());
  await deps.save(snapshot);
  return snapshot;
}

export const recordBudgetAlert = onMessagePublished({ topic: 'billing-budget-alerts', region: 'asia-south1', retry: false }, async (event) => {
  const db = getFirestore();
  await handleBudgetMessage(event.data.message.json, {
    now: () => new Date(),
    async save(latest) {
      const ref = db.collection('ops').doc('runningCosts');
      const batch = db.batch();
      batch.set(ref, { budget: latest }, { merge: true });
      batch.set(ref.collection('months').doc(latest.month), { month: latest.month, amount: latest.costAmount, currency: latest.currency, updatedAt: latest.updatedAt });
      await batch.commit();
    },
  });
});

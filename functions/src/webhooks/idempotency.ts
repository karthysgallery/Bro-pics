export interface WebhookDocRef {
  readonly path: string;
}

export interface WebhookTransaction {
  get(ref: WebhookDocRef): Promise<{ exists: boolean }>;
  set(ref: WebhookDocRef, data: { processedAt: string; orderId: string }): void;
}

function webhookRef(eventId: string): WebhookDocRef {
  return { path: `webhookEvents/${eventId}` };
}

export async function isDuplicateWebhookEvent(
  tx: WebhookTransaction,
  eventId: string
): Promise<boolean> {
  const snapshot = await tx.get(webhookRef(eventId));
  return snapshot.exists;
}

export function markWebhookProcessed(tx: WebhookTransaction, eventId: string, orderId: string): void {
  tx.set(webhookRef(eventId), { processedAt: new Date().toISOString(), orderId });
}

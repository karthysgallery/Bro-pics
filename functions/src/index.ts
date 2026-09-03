import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { generateOrderNo } from './orders/orderNumber';
export type { CounterTransaction, CounterDocRef } from './orders/orderNumber';
export { isDuplicateWebhookEvent, markWebhookProcessed } from './webhooks/idempotency';
export type { WebhookTransaction, WebhookDocRef } from './webhooks/idempotency';
export { onVariantWritten } from './products/denormalize';
export { onMediaWritten } from './products/denormalize-media';
export { reconcileSessionOnLogin } from './accounts/reconcile-session';

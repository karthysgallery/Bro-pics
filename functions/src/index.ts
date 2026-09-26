import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { generateOrderNo } from './orders/orderNumber';
export type { CounterTransaction, CounterDocRef } from './orders/orderNumber';
export { isDuplicateWebhookEvent, markWebhookProcessed } from './webhooks/idempotency';
export type { WebhookTransaction, WebhookDocRef } from './webhooks/idempotency';
export { onVariantWritten } from './products/denormalize';
export { onMediaWritten } from './products/denormalize-media';
export { onReviewWritten } from './products/denormalize-ratings';
export { reconcileSessionOnLogin } from './accounts/reconcile-session';
export { razorpayWebhook } from './webhooks/razorpay';
export { reconcileStuckOrders } from './reconciliation/reconcile-orders';
export { cleanupStaleSessions } from './cleanup/cleanup-stale-sessions';
export { rollupDailyAnalytics } from './analytics/daily-rollup';

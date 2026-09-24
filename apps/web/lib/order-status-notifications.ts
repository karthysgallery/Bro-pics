import type { OrderStatus, NotificationCategory } from '@bro-pics/shared';

/**
 * [ABE-16] Extracted from the staff-advance route so a new resend
 * endpoint can reuse the exact same mapping without duplicating it —
 * "resend the notification for this order's status" only means
 * something if it's the SAME copy the original send used.
 */
export const NOTIFICATION_BY_STATUS: Partial<Record<OrderStatus, { category: NotificationCategory; title: string; body: string }>> = {
  paid: { category: 'payment', title: 'Payment confirmed', body: 'has been confirmed.' },
  in_production: { category: 'order', title: 'Order in production', body: 'is now being printed.' },
  printed_packed: { category: 'order', title: 'Order packed', body: 'has been printed and packed.' },
  // 'packed' is the canonical QC-path successor to printed_packed's
  // meaning — same customer-facing notification. quality_check/rework
  // are deliberately absent: internal production sub-stages, silent to
  // the customer.
  packed: { category: 'order', title: 'Order packed', body: 'has been printed and packed.' },
  shipped: { category: 'shipping', title: 'Order shipped', body: 'has shipped.' },
  delivered: { category: 'delivery', title: 'Order delivered', body: 'has been delivered.' },
  cancelled: { category: 'order', title: 'Order cancelled', body: 'has been cancelled.' },
  refunded: { category: 'refund', title: 'Order refunded', body: 'has been refunded.' },
  replacement_issued: { category: 'order', title: 'Replacement issued', body: 'has a replacement on the way.' },
};

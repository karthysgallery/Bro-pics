import { describe, it, expect } from 'vitest';
import { notificationOutboxId, buildQueuedNotification } from './notification-outbox';

describe('notificationOutboxId', () => {
  it('keys an order transition on {orderId}_{status}', () => {
    expect(notificationOutboxId('order', 'order_1', 'paid')).toBe('order_1_paid');
  });

  it('keys a return transition on return_{returnId}_{status}, so it can never collide with an order key', () => {
    expect(notificationOutboxId('return', 'ret_1', 'approved')).toBe('return_ret_1_approved');
  });

  it('is deterministic for the same inputs (redelivery-safe)', () => {
    expect(notificationOutboxId('order', 'order_1', 'paid')).toBe(notificationOutboxId('order', 'order_1', 'paid'));
  });

  it('differs across statuses on the same order — one entry per transition, not per order', () => {
    expect(notificationOutboxId('order', 'order_1', 'paid')).not.toBe(notificationOutboxId('order', 'order_1', 'shipped'));
  });
});

describe('buildQueuedNotification', () => {
  it('builds a fresh entry with status queued and attempts 0', () => {
    const entry = buildQueuedNotification({
      id: 'order_1_paid',
      userId: 'user_1',
      channel: 'email',
      category: 'payment',
      title: 'Payment confirmed',
      body: 'Order BP-2026-00001 has been confirmed.',
    });
    expect(entry.status).toBe('queued');
    expect(entry.attempts).toBe(0);
    expect(entry.linkHref).toBeNull();
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it('carries a provided linkHref through', () => {
    const entry = buildQueuedNotification({
      id: 'order_1_paid',
      userId: 'user_1',
      channel: 'email',
      category: 'payment',
      title: 'Payment confirmed',
      body: 'body',
      linkHref: '/orders/order_1',
    });
    expect(entry.linkHref).toBe('/orders/order_1');
  });
});

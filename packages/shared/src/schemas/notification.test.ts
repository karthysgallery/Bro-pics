import { describe, it, expect } from 'vitest';
import {
  NotificationSchema,
  NotificationPreferencesSchema,
  TRANSACTIONAL_NOTIFICATION_CATEGORIES,
  MARKETING_NOTIFICATION_CATEGORIES,
} from './notification';

function baseNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notif_1',
    userId: 'user_1',
    category: 'order',
    title: 'Order confirmed',
    body: 'Your order BP-2026-00001 has been confirmed.',
    linkHref: '/orders/order_1',
    isRead: false,
    createdAt: '2026-09-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('NotificationSchema', () => {
  it('accepts a valid notification', () => {
    expect(NotificationSchema.safeParse(baseNotification()).success).toBe(true);
  });

  it('accepts every transactional and marketing category', () => {
    for (const category of [...TRANSACTIONAL_NOTIFICATION_CATEGORIES, ...MARKETING_NOTIFICATION_CATEGORIES]) {
      expect(NotificationSchema.safeParse(baseNotification({ category })).success).toBe(true);
    }
  });

  it('rejects an unknown category', () => {
    expect(NotificationSchema.safeParse(baseNotification({ category: 'bogus' })).success).toBe(false);
  });

  it('rejects a blank title or body', () => {
    expect(NotificationSchema.safeParse(baseNotification({ title: '' })).success).toBe(false);
    expect(NotificationSchema.safeParse(baseNotification({ body: '' })).success).toBe(false);
  });

  it('accepts a null linkHref', () => {
    expect(NotificationSchema.safeParse(baseNotification({ linkHref: null })).success).toBe(true);
  });
});

describe('NotificationPreferencesSchema', () => {
  it('accepts all-true and all-false', () => {
    expect(NotificationPreferencesSchema.safeParse({ priceDrop: true, offers: true, recommendations: true }).success).toBe(true);
    expect(NotificationPreferencesSchema.safeParse({ priceDrop: false, offers: false, recommendations: false }).success).toBe(true);
  });

  it('rejects a missing field', () => {
    expect(NotificationPreferencesSchema.safeParse({ priceDrop: true, offers: true }).success).toBe(false);
  });
});

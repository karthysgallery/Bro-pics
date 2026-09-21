import { z } from 'zod';

// Transactional categories are always on (never user-togglable, per the
// spec's own "transactional stays separate from marketing" requirement);
// marketing categories are the only ones NotificationPreferencesSchema
// exposes a toggle for.
export const TRANSACTIONAL_NOTIFICATION_CATEGORIES = ['order', 'payment', 'shipping', 'delivery', 'refund'] as const;
export const MARKETING_NOTIFICATION_CATEGORIES = ['price_drop', 'offers', 'recommendations'] as const;

export const NotificationCategorySchema = z.enum([
  ...TRANSACTIONAL_NOTIFICATION_CATEGORIES,
  ...MARKETING_NOTIFICATION_CATEGORIES,
]);

export const NotificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  category: NotificationCategorySchema,
  title: z.string().min(1),
  body: z.string().min(1),
  linkHref: z.string().nullable(),
  isRead: z.boolean(),
  createdAt: z.string(),
});

export const NotificationPreferencesSchema = z.object({
  priceDrop: z.boolean(),
  offers: z.boolean(),
  recommendations: z.boolean(),
});

export type NotificationCategory = z.infer<typeof NotificationCategorySchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;
